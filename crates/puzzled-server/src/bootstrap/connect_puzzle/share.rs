use chrono::Utc;
use connectrpc::{
    ConnectError, ErrorCode, RequestContext, Response, ServiceRequest, ServiceResult,
};
use tracing::warn;

use puzzled_core::puzzle_play::daily_time::product_day_key;
use puzzled_core::puzzle_play::game_slugs::{canonicalize_game_slug, is_valid_game_slug};

use super::{date_from_string, PuzzleConnectService, TRACE_TARGET};
use crate::capabilities::gamification::adapters::streak_read::load_settled_streak_on_connection;
use crate::capabilities::puzzle_play::adapters::result_shares_db::{
    load_shared_result, record_share_on_connection, set_share_streak_on_connection,
};

use crate::proto::puzzled::v1::{
    GetSharedResultRequest, GetSharedResultResponse, RecordShareLandingRequest,
    RecordShareLandingResponse, ShareResultRequest, ShareResultResponse,
};

impl PuzzleConnectService {
    pub(super) async fn share_result_rpc(
        &self,
        ctx: RequestContext,
        request: ServiceRequest<'_, ShareResultRequest>,
    ) -> ServiceResult<ShareResultResponse> {
        let req = request.to_owned_message();
        let game_slug = canonicalize_game_slug(req.game_slug.trim());
        if !is_valid_game_slug(game_slug) {
            return Err(ConnectError::new(ErrorCode::NotFound, "unknown_game"));
        }
        let mut access = self.adopt_guest_progress_if_needed(&ctx, true).await?;
        let uid = access
            .primary()
            .map(|identity| identity.user_id.clone())
            .ok_or_else(|| {
                ConnectError::new(ErrorCode::Unauthenticated, "identity_required_for_submit")
            })?;
        let day =
            date_from_string(req.puzzle_date.as_deref()).unwrap_or(product_day_key(Utc::now()));
        let Some(connection) = access.connection() else {
            return Err(ConnectError::new(
                ErrorCode::Unavailable,
                "share_unavailable",
            ));
        };
        let response = match record_share_on_connection(
            &mut *connection,
            &uid,
            game_slug,
            &day.format("%Y-%m-%d").to_string(),
            req.tap,
        )
        .await
        {
            Ok(Some(id)) => {
                // A same-day share carries the sharer's streak on its card.
                if day == product_day_key(Utc::now()) {
                    match load_settled_streak_on_connection(&mut *connection, &uid, day).await {
                        Ok((streak, _, _)) if streak.current_streak > 0 => {
                            let streak = i32::try_from(streak.current_streak).unwrap_or(i32::MAX);
                            if let Err(error) =
                                set_share_streak_on_connection(&mut *connection, id, streak).await
                            {
                                warn!(target: TRACE_TARGET, %error, "share streak not stored");
                            }
                        }
                        Ok(_) => {}
                        Err(error) => warn!(target: TRACE_TARGET, %error, "share streak not read"),
                    }
                }
                Response::ok(ShareResultResponse {
                    share_id: id.to_string(),
                    ..Default::default()
                })
            }
            // Nothing to share until the player has an accepted finish.
            Ok(None) => Err(ConnectError::new(ErrorCode::NotFound, "no_finish_to_share")),
            Err(error) => {
                warn!(target: TRACE_TARGET, %error, "share_result failed");
                Err(ConnectError::new(ErrorCode::Internal, "share_failed"))
            }
        };
        if response.is_ok() {
            access.commit().await?;
        }
        response
    }

    pub(super) async fn get_shared_result_rpc(
        &self,
        _ctx: RequestContext,
        request: ServiceRequest<'_, GetSharedResultRequest>,
    ) -> ServiceResult<GetSharedResultResponse> {
        let req = request.to_owned_message();
        let id = uuid::Uuid::parse_str(req.share_id.trim())
            .map_err(|_| ConnectError::new(ErrorCode::NotFound, "share_not_found"))?;
        let Some(pool) = &self.state.pool else {
            return Err(ConnectError::new(
                ErrorCode::Unavailable,
                "share_unavailable",
            ));
        };
        match load_shared_result(pool, id).await {
            Ok(Some(shared)) => Response::ok(GetSharedResultResponse {
                game_slug: shared.game_slug,
                puzzle_date: shared.day_key,
                difficulty: shared.difficulty.unwrap_or_default(),
                status: shared.status,
                attempts: u32::try_from(shared.attempts).unwrap_or_default(),
                score: shared.score.and_then(|v| u32::try_from(v).ok()),
                time_spent_ms: shared.time_spent_ms.and_then(|v| u64::try_from(v).ok()),
                streak: shared.streak.and_then(|v| u32::try_from(v).ok()),
                ..Default::default()
            }),
            Ok(None) => Err(ConnectError::new(ErrorCode::NotFound, "share_not_found")),
            Err(error) => {
                warn!(target: TRACE_TARGET, %error, "get_shared_result failed");
                Err(ConnectError::new(ErrorCode::Internal, "share_read_failed"))
            }
        }
    }

    pub(super) async fn record_share_landing_rpc(
        &self,
        ctx: RequestContext,
        request: ServiceRequest<'_, RecordShareLandingRequest>,
    ) -> ServiceResult<RecordShareLandingResponse> {
        let origin = crate::shared::public_origin::public_origin()
            .map_err(|_| ConnectError::new(ErrorCode::Unavailable, "public_origin_unavailable"))?;
        if !crate::shared::public_origin::admits_browser(ctx.headers(), &origin) {
            return Err(ConnectError::new(
                ErrorCode::PermissionDenied,
                "same_origin_required",
            ));
        }
        let input = request.to_owned_message();
        if !input.analytics_consent {
            return Response::ok(RecordShareLandingResponse::default());
        }
        let share = uuid::Uuid::parse_str(input.share_id.trim())
            .map_err(|_| ConnectError::new(ErrorCode::InvalidArgument, "invalid_share"))?;
        let mut access = self.adopt_guest_progress_if_needed(&ctx, true).await?;
        let uid = access
            .primary()
            .and_then(|i| {
                puzzled_core::identity_policy::guest_day_id::user_id_to_storage_uuid(&i.user_id)
            })
            .ok_or_else(|| ConnectError::new(ErrorCode::Unauthenticated, "identity_required"))?;
        let connection = access
            .connection()
            .ok_or_else(|| ConnectError::new(ErrorCode::Unavailable, "database_unavailable"))?;
        crate::capabilities::metrics::landing_on(connection, uid, share)
            .await
            .map_err(|_| ConnectError::new(ErrorCode::Unavailable, "landing_unavailable"))?;
        access.commit().await?;
        Response::ok(RecordShareLandingResponse::default())
    }
}
