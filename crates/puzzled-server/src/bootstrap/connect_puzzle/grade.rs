use std::collections::HashMap;

use chrono::{NaiveDate, Utc};
use connectrpc::{
    ConnectError, ErrorCode, RequestContext, Response, ServiceRequest, ServiceResult,
};
use serde_json::Value;

use puzzled_core::puzzle_play::application::guess_grading::{
    grade_guess, grades_guesses, guess_limit,
};
use puzzled_core::puzzle_play::daily_time::product_day_key;
use puzzled_core::puzzle_play::game_slugs::canonicalize_game_slug;

use super::{admission::Admission, date_from_string, PuzzleConnectService};
use crate::capabilities::daily_pipeline;
use crate::capabilities::puzzle_play::adapters::daily_puzzles_db::fetch_puzzle_by_id;
use crate::proto::puzzled::v1::{CheckGuessRequest, CheckGuessResponse};

impl PuzzleConnectService {
    pub(super) async fn check_guess_rpc(
        &self,
        ctx: RequestContext,
        request: ServiceRequest<'_, CheckGuessRequest>,
    ) -> ServiceResult<CheckGuessResponse> {
        let req = request.to_owned_message();
        let game_slug = canonicalize_game_slug(req.game_slug.trim());
        if !grades_guesses(game_slug) {
            return Err(ConnectError::new(
                ErrorCode::InvalidArgument,
                "game_not_graded_per_guess",
            ));
        }
        let platform = crate::bootstrap::identity::require_identity(&ctx).ok();
        if platform.is_none() && crate::bootstrap::identity::guest_credential_hash(&ctx).is_none() {
            return Err(ConnectError::new(
                ErrorCode::Unauthenticated,
                "identity_required_for_submit",
            ));
        }
        let today = product_day_key(Utc::now());
        let date = date_from_string(req.puzzle_date.as_deref()).unwrap_or(today);
        let billing_user = platform.as_ref().map(|identity| identity.user_id.as_str());
        let admission = self
            .enforce_play_access(&ctx, billing_user, game_slug, date)
            .await?;
        let difficulty = Some(req.difficulty.trim()).filter(|d| !d.is_empty());
        let guess: Value = serde_json::from_str(&req.guess_json)
            .map_err(|_| ConnectError::new(ErrorCode::InvalidArgument, "invalid_guess_json"))?;
        let puzzle = match (req.puzzle_id.as_deref(), &self.state.pool) {
            (Some(pid), Some(pool)) => match fetch_puzzle_by_id(pool, pid).await {
                Ok(Some(p)) if p.game_slug == game_slug => p.solution,
                _ => None,
            },
            _ => daily_pipeline::resolve(self.state.pool.as_ref(), game_slug, date, difficulty)
                .await
                .ok()
                .map(|found| found.solution),
        };
        let Some(solution) = puzzle else {
            return Err(ConnectError::new(ErrorCode::NotFound, "puzzle_unavailable"));
        };
        // Reject invalid input before claiming a pick or charging an attempt.
        let result = grade_guess(game_slug, &solution, &guess)
            .map_err(|error| ConnectError::new(ErrorCode::InvalidArgument, error))?;
        // A direct graded guess is also active play; even a fresh credential
        // must persist its pick before we return any graded result.
        let mut access = self.adopt_guest_progress_if_needed(&ctx, true).await?;
        if access.primary().is_none() && self.state.pool.is_some() {
            return Err(ConnectError::new(
                ErrorCode::Unauthenticated,
                "identity_required_for_submit",
            ));
        }
        if admission == Admission::FreePick {
            self.claim_free_pick(&mut access, billing_user, game_slug, today)
                .await?;
        }
        let uid = access
            .primary()
            .map(|identity| identity.user_id.clone())
            .or_else(|| {
                crate::bootstrap::identity::guest_credential_hash(&ctx)
                    .map(|hash| format!("tok:{hash}"))
            })
            .ok_or_else(|| {
                ConnectError::new(ErrorCode::Unauthenticated, "identity_required_for_submit")
            })?;
        let key = format!("{uid}|{game_slug}|{date}|{}", difficulty.unwrap_or(""));
        if !self.take_guess(key, today, guess_limit(game_slug).unwrap_or(0)) {
            return Err(ConnectError::new(
                ErrorCode::ResourceExhausted,
                "guess_limit_reached",
            ));
        }
        access.commit().await?;
        Response::ok(CheckGuessResponse {
            result_json: result.to_string(),
            ..Default::default()
        })
    }

    /// Count one graded guess; false once the player has used the game's limit.
    fn take_guess(&self, key: String, today: NaiveDate, limit: u32) -> bool {
        let Ok(mut guard) = self.guesses.lock() else {
            return false;
        };
        if guard.0 != today {
            *guard = (today, HashMap::new());
        }
        let used = guard.1.entry(key).or_insert(0);
        if *used >= limit {
            return false;
        }
        *used += 1;
        true
    }
}
