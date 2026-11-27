use chrono::Utc;
use connectrpc::{
    ConnectError, ErrorCode, RequestContext, Response, ServiceRequest, ServiceResult,
};
use serde_json::Value;
use tracing::warn;

use puzzled_core::puzzle_play::application::submission_validation::{
    validate_submission, SubmissionEnvelope,
};
use puzzled_core::puzzle_play::daily_time::product_day_key;
use puzzled_core::puzzle_play::game_slugs::{canonicalize_game_slug, is_valid_game_slug};

use super::{
    admission::Admission, date_from_string, five_admission, parse_status, status_label,
    submit_puzzle::SubmissionPuzzle, PuzzleConnectService, TRACE_TARGET,
};
use crate::capabilities::puzzle_play::adapters::game_sessions_db::{
    has_completed_session_on_connection, has_ritual_completion_on_connection,
    persist_validated_session_on_connection, ValidatedSession,
};
use crate::proto::puzzled::v1::{SubmitGuessRequest, SubmitGuessResponse};

const SLICE_SUBMIT: &str = "S2-puzzle-solution-connect";

impl PuzzleConnectService {
    pub(super) async fn submit_guess_rpc(
        &self,
        ctx: RequestContext,
        request: ServiceRequest<'_, SubmitGuessRequest>,
    ) -> ServiceResult<SubmitGuessResponse> {
        let input = request.to_owned_message();
        let today = product_day_key(Utc::now());
        // Any game today can be one of a player's free picks.
        let free = date_from_string(input.puzzle_date.as_deref()).unwrap_or(today) == today;
        let result = self.submit_guess_inner(ctx, request).await;
        if free {
            if let Some(pool) = self.state.pool.clone() {
                let failed = result.as_ref().err().is_some_and(|e| {
                    matches!(
                        e.code,
                        ErrorCode::Internal
                            | ErrorCode::Unavailable
                            | ErrorCode::Unknown
                            | ErrorCode::DeadlineExceeded
                    )
                });
                tokio::spawn(async move {
                    crate::capabilities::metrics::count(
                        &pool,
                        if failed {
                            "free_finish_failed"
                        } else {
                            "free_finish_ok"
                        },
                    )
                    .await;
                });
            }
        }
        result
    }

    async fn submit_guess_inner(
        &self,
        ctx: RequestContext,
        request: ServiceRequest<'_, SubmitGuessRequest>,
    ) -> ServiceResult<SubmitGuessResponse> {
        let req = request.to_owned_message();
        let game_slug = canonicalize_game_slug(req.game_slug.trim());
        if game_slug.is_empty() {
            return Err(ConnectError::new(
                ErrorCode::InvalidArgument,
                "game_slug_required",
            ));
        }
        if !is_valid_game_slug(game_slug) {
            return Err(ConnectError::new(
                ErrorCode::InvalidArgument,
                "unknown_game",
            ));
        }
        let Some(status) = parse_status(&req.status) else {
            return Err(ConnectError::new(
                ErrorCode::InvalidArgument,
                "status_required_won_or_lost",
            ));
        };
        // Platform auth **or** stable guest-day id (free-ritual protocol default).
        let platform = crate::bootstrap::identity::require_identity(&ctx).ok();
        if platform.is_none() && crate::bootstrap::identity::guest_credential_hash(&ctx).is_none() {
            return Err(ConnectError::new(
                ErrorCode::Unauthenticated,
                "identity_required_for_submit",
            ));
        }

        let data: Value = if req.submission_json.trim().is_empty() {
            Value::Null
        } else {
            match serde_json::from_str(&req.submission_json) {
                Ok(v) => v,
                Err(_) => {
                    return Err(ConnectError::new(
                        ErrorCode::InvalidArgument,
                        "invalid_submission_json",
                    ));
                }
            }
        };

        let now = Utc::now();
        let today = product_day_key(now);
        let date = date_from_string(req.puzzle_date.as_deref()).unwrap_or(today);
        let billing_user = platform.as_ref().map(|identity| identity.user_id.as_str());
        let admission = self
            .enforce_play_access(&ctx, billing_user, game_slug, date)
            .await?;
        let difficulty = {
            let d = req.difficulty.trim();
            if d.is_empty() {
                None
            } else {
                Some(d.to_string())
            }
        };

        let SubmissionPuzzle {
            puzzle_data,
            solution,
            resolved_id,
        } = self
            .resolve_submission_puzzle(
                req.puzzle_id.as_deref(),
                game_slug,
                date,
                difficulty.as_deref(),
            )
            .await?;

        let mut access = self.adopt_guest_progress_if_needed(&ctx, true).await?;
        let uid = access
            .primary()
            .map(|identity| identity.user_id.clone())
            .ok_or_else(|| {
                ConnectError::new(ErrorCode::Unauthenticated, "identity_required_for_submit")
            })?;
        five_admission::require_admitted(&mut access, game_slug, date, resolved_id.as_deref())
            .await?;
        // One verified finish per served puzzle **and** per free-daily
        // (user, game_slug, product day). Must not require resolved puzzle_id:
        // deterministic sudoku has no store row and sessions may store null
        // puzzle_id — dogfood residual double-finish when guard was pid-only.
        if let Some(connection) = access.connection() {
            let already = match has_completed_session_on_connection(
                &mut *connection,
                &uid,
                game_slug,
                Some(date),
                resolved_id.as_deref(),
            )
            .await
            {
                Ok(v) => v,
                Err(error) => {
                    warn!(target: TRACE_TARGET, %error, "submit completion lookup failed");
                    return Err(ConnectError::new(
                        ErrorCode::Internal,
                        "session_lookup_failed",
                    ));
                }
            };
            // Ritual path: also key on day_key so a prior null-puzzle_id win
            // blocks re-submit even if puzzle_date/id wiring diverges.
            let already_ritual = if date == today {
                match has_ritual_completion_on_connection(&mut *connection, &uid, game_slug, today)
                    .await
                {
                    Ok(v) => v,
                    Err(error) => {
                        warn!(target: TRACE_TARGET, %error, "submit ritual completion lookup failed");
                        return Err(ConnectError::new(
                            ErrorCode::Internal,
                            "session_lookup_failed",
                        ));
                    }
                }
            } else {
                false
            };
            if already || already_ritual {
                return Err(ConnectError::new(
                    ErrorCode::AlreadyExists,
                    "already_played",
                ));
            }
        }
        if admission == Admission::FreePick {
            self.claim_free_pick(&mut access, billing_user, game_slug, today)
                .await?;
        }

        let envelope = SubmissionEnvelope {
            status,
            attempts: req.attempts,
            time_spent_ms: req.time_spent_ms,
            data,
        };
        let verdict = validate_submission(game_slug, &puzzle_data, &solution, &envelope);

        if !verdict.valid {
            // Dropping access rolls back any first-write allocation or adoption.
            return Response::ok(SubmitGuessResponse {
                valid: false,
                status: String::new(),
                score: None,
                game_slug: game_slug.to_string(),
                error: verdict
                    .error
                    .clone()
                    .or_else(|| Some("invalid_submission".to_string())),
                slice: SLICE_SUBMIT.to_string(),
                ..Default::default()
            });
        }

        let score = verdict.score.unwrap_or(0);
        let mode = if date == today { "daily" } else { "archive" };
        // Ritual day_key: for daily mode use product day key; archive is not ritual.
        let ritual_day_key = if mode == "daily" { Some(today) } else { None };
        if let Some(connection) = access.connection() {
            match persist_validated_session_on_connection(
                connection,
                ValidatedSession {
                    user_id: &uid,
                    game_slug,
                    difficulty: difficulty.as_deref(),
                    mode,
                    status: status_label(verdict.status.unwrap_or(status)),
                    score: Some(i32::try_from(score).unwrap_or(i32::MAX)),
                    attempts: req.attempts,
                    time_spent_ms: req.time_spent_ms,
                    puzzle_id: resolved_id.as_deref(),
                    puzzle_date: Some(date),
                    day_key: ritual_day_key,
                    at_ms: now.timestamp_millis(),
                    // Extract only after this exact envelope has passed validation.
                    hints_used: (game_slug == "cryptogram").then(|| {
                        envelope
                            .data
                            .get("hintsUsed")
                            .and_then(|v| v.as_u64())
                            .map(|v| v as i64)
                            .unwrap_or(0)
                    }),
                    // This header only removes a validated finish from comparisons.
                    // It grants no write/auth authority. Recognize older harnesses too.
                    comparison_excluded: ctx.headers().contains_key("x-puzzled-verification")
                        || ctx
                            .headers()
                            .get("user-agent")
                            .and_then(|v| v.to_str().ok())
                            .is_some_and(|v| v.starts_with("puzzled-verify-live/")),
                },
            )
            .await
            {
                Ok(_) => {}
                Err(error) if error == "already_played" => {
                    return Err(ConnectError::new(
                        ErrorCode::AlreadyExists,
                        "already_played",
                    ));
                }
                Err(error) => {
                    warn!(target: TRACE_TARGET, %error, "submit session persist failed");
                    return Err(ConnectError::new(
                        ErrorCode::Internal,
                        "session_persist_failed",
                    ));
                }
            }
        }

        access.commit().await?;
        Response::ok(SubmitGuessResponse {
            valid: true,
            status: status_label(verdict.status.unwrap_or(status)).to_string(),
            score: Some(score),
            game_slug: game_slug.to_string(),
            error: None,
            slice: SLICE_SUBMIT.to_string(),
            // The finish is accepted, so the answer may be shown now.
            reveal_json: Some(solution.to_string()),
            ..Default::default()
        })
    }
}
