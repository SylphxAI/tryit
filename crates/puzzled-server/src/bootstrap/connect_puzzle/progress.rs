use std::collections::HashMap;

use chrono::Utc;
use connectrpc::{
    ConnectError, ErrorCode, RequestContext, Response, ServiceRequest, ServiceResult,
};
use tracing::warn;

use puzzled_core::identity_policy::guest_day_id::user_id_to_storage_uuid;
use puzzled_core::puzzle_play::daily_time::product_day_key;
use puzzled_core::puzzle_play::game_slugs::{canonicalize_game_slug, is_valid_game_slug};

use super::{PuzzleConnectService, TRACE_TARGET};
use crate::capabilities::puzzle_play::adapters::daily_free_picks;
use crate::capabilities::puzzle_play::adapters::game_sessions_db::{
    load_today_progress_on_connection, CompletedSession,
};
use crate::proto::puzzled::v1::{
    DailyCompletion, GameProgress, GetTodayProgressRequest, GetTodayProgressResponse,
    TodayFreePicks,
};

/// Most slugs one GetTodayProgress may name (the catalogue is nineteen).
const MAX_PROGRESS_SLUGS: usize = 64;

impl PuzzleConnectService {
    pub(super) async fn get_today_progress_rpc(
        &self,
        ctx: RequestContext,
        request: ServiceRequest<'_, GetTodayProgressRequest>,
    ) -> ServiceResult<GetTodayProgressResponse> {
        let req = request.to_owned_message();
        let slugs = progress_slugs(&req.game_slugs)?;

        let mut access = self.adopt_guest_progress_if_needed(&ctx, false).await?;
        let identity = access.primary().map(|identity| identity.user_id.clone());
        // The product day is the server's; the client never names it.
        let today = product_day_key(Utc::now());

        let finished = match (identity.as_deref(), access.connection()) {
            (Some(uid), Some(connection)) if !slugs.is_empty() => {
                let canonical: Vec<String> = slugs.iter().map(|(_, c)| c.clone()).collect();
                load_today_progress_on_connection(connection, uid, &canonical, today)
                    .await
                    .map_err(|error| {
                        warn!(target: TRACE_TARGET, %error, "get_today_progress lookup failed");
                        ConnectError::new(ErrorCode::Internal, "session_lookup_failed")
                    })?
            }
            _ => HashMap::new(),
        };
        let game_slugs = match (
            identity.as_deref().and_then(user_id_to_storage_uuid),
            access.connection(),
        ) {
            (Some(player), Some(connection)) => daily_free_picks::list_for_player(
                connection, player, today,
            )
            .await
            .map_err(|error| {
                warn!(target: TRACE_TARGET, %error, "get_today_progress picks lookup failed");
                ConnectError::new(ErrorCode::Internal, "pick_lookup_failed")
            })?,
            _ => Vec::new(),
        };
        access.commit().await?;

        Response::ok(GetTodayProgressResponse {
            day_key: today.format("%Y-%m-%d").to_string(),
            games: progress_entries(&slugs, &finished),
            free_picks: Some(TodayFreePicks {
                game_slugs,
                ..Default::default()
            })
            .into(),
            ..Default::default()
        })
    }
}

/// Requested slugs paired with their canonical storage slug, request order kept.
fn progress_slugs(raw: &[String]) -> Result<Vec<(String, String)>, ConnectError> {
    if raw.len() > MAX_PROGRESS_SLUGS {
        return Err(ConnectError::new(
            ErrorCode::InvalidArgument,
            "too_many_games",
        ));
    }
    raw.iter()
        .map(|slug| {
            let canonical = canonicalize_game_slug(slug.trim());
            if canonical.is_empty() {
                return Err(ConnectError::new(
                    ErrorCode::InvalidArgument,
                    "game_slug_required",
                ));
            }
            if !is_valid_game_slug(canonical) {
                return Err(ConnectError::new(ErrorCode::NotFound, "unknown_game"));
            }
            Ok((slug.clone(), canonical.to_string()))
        })
        .collect()
}

/// Per-game flags in request order. A finish is reported only when the row
/// exists; nothing here carries a puzzle or an answer.
fn progress_entries(
    slugs: &[(String, String)],
    finished: &HashMap<String, CompletedSession>,
) -> Vec<GameProgress> {
    slugs
        .iter()
        .map(|(requested, canonical)| {
            let session = finished.get(canonical);
            GameProgress {
                game_slug: requested.clone(),
                has_completed: session.is_some(),
                completed_session: session
                    .map(|session| DailyCompletion {
                        status: session.status.clone(),
                        score: session.score.and_then(|score| u32::try_from(score).ok()),
                        attempts: u32::try_from(session.attempts).ok(),
                        completed_at_ms: session
                            .completed_at
                            .map(|completed_at| completed_at.and_utc().timestamp_millis()),
                        difficulty: session.difficulty.clone(),
                        time_spent_ms: session.time_spent_ms.and_then(|ms| u64::try_from(ms).ok()),
                        ..Default::default()
                    })
                    .into(),
                ..Default::default()
            }
        })
        .collect()
}

#[cfg(test)]
#[path = "tests.rs"]
mod today_progress_tests;
