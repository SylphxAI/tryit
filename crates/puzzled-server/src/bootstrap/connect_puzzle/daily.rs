use chrono::Utc;
use connectrpc::{
    ConnectError, ErrorCode, RequestContext, Response, ServiceRequest, ServiceResult,
};
use serde_json::Value;
use tracing::warn;

use puzzled_core::puzzle_play::crossword_generate::client_safe_puzzle_data;
use puzzled_core::puzzle_play::daily_time::product_day_key;
use puzzled_core::puzzle_play::game_flows::build_daily_status;
use puzzled_core::puzzle_play::game_slugs::{canonicalize_game_slug, is_valid_game_slug};

use super::{admission::Admission, date_from_string, PuzzleConnectService, TRACE_TARGET};
use crate::capabilities::daily_pipeline;
use crate::capabilities::puzzle_play::adapters::game_sessions_db::load_completed_session_on_connection;
use crate::proto::puzzled::v1::{
    DailyCompletion, GetDailyRequest, GetDailyResponse, StartDailyRequest, StartDailyResponse,
};

const SLICE_DAILY: &str = "S2-daily-connect";

impl PuzzleConnectService {
    pub(super) async fn get_daily_rpc(
        &self,
        ctx: RequestContext,
        request: ServiceRequest<'_, GetDailyRequest>,
    ) -> ServiceResult<GetDailyResponse> {
        Response::ok(
            self.daily_snapshot(&ctx, request.to_owned_message(), false)
                .await?,
        )
    }

    pub(super) async fn start_daily_rpc(
        &self,
        ctx: RequestContext,
        request: ServiceRequest<'_, StartDailyRequest>,
    ) -> ServiceResult<StartDailyResponse> {
        let origin = crate::shared::public_origin::public_origin()
            .map_err(|_| ConnectError::new(ErrorCode::Unavailable, "public_origin_unavailable"))?;
        if !crate::shared::public_origin::admits_browser(ctx.headers(), &origin) {
            return Err(ConnectError::new(
                ErrorCode::PermissionDenied,
                "same_origin_required",
            ));
        }
        let start = request.to_owned_message();
        let daily = self
            .daily_snapshot(
                &ctx,
                GetDailyRequest {
                    game_slug: start.game_slug,
                    difficulty: start.difficulty,
                    puzzle_date: Some(start.puzzle_date),
                    ..Default::default()
                },
                true,
            )
            .await?;
        Response::ok(StartDailyResponse {
            daily: Some(daily).into(),
            ..Default::default()
        })
    }

    async fn daily_snapshot(
        &self,
        ctx: &RequestContext,
        req: GetDailyRequest,
        start: bool,
    ) -> Result<GetDailyResponse, ConnectError> {
        let game_slug = canonicalize_game_slug(req.game_slug.trim());
        if game_slug.is_empty() {
            return Err(ConnectError::new(
                ErrorCode::InvalidArgument,
                "game_slug_required",
            ));
        }
        if !is_valid_game_slug(game_slug) {
            return Err(ConnectError::new(ErrorCode::NotFound, "unknown_game"));
        }

        let platform = crate::bootstrap::identity::require_identity(ctx).ok();
        if start
            && platform.is_none()
            && crate::bootstrap::identity::guest_credential_hash(ctx).is_none()
        {
            return Err(ConnectError::new(
                ErrorCode::Unauthenticated,
                "identity_required",
            ));
        }
        let billing_user = platform.as_ref().map(|identity| identity.user_id.as_str());
        let difficulty = {
            let d = req.difficulty.trim();
            if d.is_empty() {
                None
            } else {
                Some(d.to_string())
            }
        };
        let today = product_day_key(Utc::now());
        // Archive reads: puzzle_date (YYYY-MM-DD), default = product day key.
        let requested_date = date_from_string(req.puzzle_date.as_deref());
        if start && requested_date != Some(today) {
            return Err(ConnectError::new(
                ErrorCode::FailedPrecondition,
                "daily_date_changed",
            ));
        }
        let puzzle_date = requested_date.unwrap_or(today);
        let is_archive = puzzle_date != today;

        let admission = self
            .enforce_play_access(ctx, billing_user, game_slug, puzzle_date)
            .await?;

        // The stored puzzle for this day, generated and stored first on a miss
        // (daily pipeline, #246). Every game has one.
        let (puzzle_data, puzzle_id, stub) = match daily_pipeline::resolve(
            self.state.pool.as_ref(),
            game_slug,
            puzzle_date,
            difficulty.as_deref(),
        )
        .await
        {
            Ok(found) => (
                Some(puzzled_core::puzzle_play::generate::served_payload(
                    game_slug,
                    &found.puzzle_data,
                    &found.solution,
                )),
                found.id,
                false,
            ),
            Err(error) => {
                warn!(target: TRACE_TARGET, %error, game_slug, %puzzle_date, "get_daily puzzle unavailable");
                (None, None, true)
            }
        };

        if start && stub {
            return Err(ConnectError::new(ErrorCode::NotFound, "puzzle_unavailable"));
        }
        let mut access = self.adopt_guest_progress_if_needed(ctx, start).await?;
        if start && access.primary().is_none() && self.state.pool.is_some() {
            return Err(ConnectError::new(
                ErrorCode::Unauthenticated,
                "identity_required",
            ));
        }
        let identity = access.primary().map(|identity| identity.user_id.clone());
        // Completion is server-derived from the user's sessions.
        let completed_session = match (identity.as_deref(), access.connection()) {
            (Some(uid), Some(connection)) => {
                match load_completed_session_on_connection(
                    connection,
                    uid,
                    game_slug,
                    Some(puzzle_date),
                    puzzle_id.as_deref(),
                )
                .await
                {
                    Ok(v) => v,
                    Err(error) => {
                        warn!(target: TRACE_TARGET, %error, "get_daily completed session lookup failed");
                        return Err(ConnectError::new(
                            ErrorCode::Internal,
                            "session_lookup_failed",
                        ));
                    }
                }
            }
            _ => None,
        };
        let has_completed = completed_session.is_some();

        let needs_pick =
            admission == Admission::FreePick && self.state.pool.is_some() && !has_completed;
        let requires_start = needs_pick && !start && !stub;
        if needs_pick && start {
            self.claim_free_pick(&mut access, billing_user, game_slug, today)
                .await?;
        }
        // Do not expose an unchosen board in the public response or SSR HTML.
        let puzzle_data = if requires_start { None } else { puzzle_data };
        let puzzle_data_value = puzzle_data.clone();
        let response = match build_daily_status(
            game_slug,
            today,
            difficulty.as_deref(),
            if has_completed {
                Some(Value::Null)
            } else {
                None
            },
            puzzle_id.clone(),
            puzzle_data_value,
        ) {
            Ok(body) => Ok(GetDailyResponse {
                game_slug: game_slug.to_string(),
                puzzle_number: body.puzzle.puzzle_number,
                puzzle_date: if is_archive {
                    puzzle_date.format("%Y-%m-%d").to_string()
                } else {
                    body.puzzle.puzzle_date
                },
                puzzle_id,
                difficulty: body
                    .puzzle
                    .difficulty
                    .unwrap_or_else(|| difficulty.unwrap_or_default()),
                has_completed,
                can_play: !has_completed,
                mode: body.mode.to_string(),
                slice: SLICE_DAILY.to_string(),
                stub,
                requires_start,
                puzzle_data_json: puzzle_data
                    .map(client_safe_puzzle_data)
                    .map(|v| v.to_string())
                    .unwrap_or_default(),
                completed_session: completed_session
                    .map(|session| DailyCompletion {
                        status: session.status,
                        score: session.score.and_then(|score| u32::try_from(score).ok()),
                        attempts: u32::try_from(session.attempts).ok(),
                        completed_at_ms: session
                            .completed_at
                            .map(|completed_at| completed_at.and_utc().timestamp_millis()),
                        difficulty: session.difficulty,
                        time_spent_ms: session.time_spent_ms.and_then(|ms| u64::try_from(ms).ok()),
                        ..Default::default()
                    })
                    .into(),
                ..Default::default()
            }),
            Err(404) => Err(ConnectError::new(ErrorCode::NotFound, "unknown_game")),
            Err(_) => Err(ConnectError::new(
                ErrorCode::InvalidArgument,
                "invalid_query",
            )),
        };
        if response.is_ok() {
            access.commit().await?;
        }
        response
    }
}
