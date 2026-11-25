use connectrpc::{
    ConnectError, ErrorCode, RequestContext, Response, ServiceRequest, ServiceResult,
};

use super::TRACE_TARGET;
use crate::bootstrap::identity::require_identity;
use crate::bootstrap::state::AppState;
use crate::proto::puzzled::v1::{RecordSignupAttributionRequest, RecordSignupAttributionResponse};

pub(super) async fn record_signup_attribution(
    state: &AppState,
    ctx: RequestContext,
    _request: ServiceRequest<'_, RecordSignupAttributionRequest>,
) -> ServiceResult<RecordSignupAttributionResponse> {
    let identity = require_identity(&ctx)?;
    // Every new account is one signup in the first-party funnel, tagged or not.
    if let Some(pool) = &state.pool {
        if let Err(error) =
            crate::capabilities::funnel::record_signup(pool, &identity.user_id).await
        {
            tracing::warn!(target: TRACE_TARGET, %error, "funnel signup not recorded");
        }
    }
    let tags = ctx
        .headers()
        .get_all(axum::http::header::COOKIE)
        .iter()
        .filter_map(|value| value.to_str().ok())
        .flat_map(|cookie| cookie.split(';'))
        .filter_map(|pair| pair.trim().strip_prefix("puzzled_signup_attr="))
        .find_map(puzzled_core::attribution::Attribution::from_cookie);
    // An advertising-only cookie (click id, no tags) writes no analytics row and
    // does not use up the account's one first-touch row.
    let (Some(tags), Some(pool)) = (
        tags.filter(|tags| {
            !crate::capabilities::money::checkout_attribution::gpc(ctx.headers()) && tags.has_tag()
        }),
        &state.pool,
    ) else {
        return Response::ok(RecordSignupAttributionResponse::default());
    };
    let recorded = crate::capabilities::preferences::adapters::attribution_db::record_attribution(
        pool,
        &identity.user_id,
        &tags,
    )
    .await
    .map_err(|error| {
        tracing::warn!(target: TRACE_TARGET, %error, "signup attribution failed");
        ConnectError::new(ErrorCode::Unavailable, "attribution_unavailable")
    })?;
    if recorded {
        // Tryit-referred: queue the sign-up and send it once now (3s cap);
        // a failure stays queued for the sweep.
        let queued = crate::capabilities::tryit_conversions::enqueue(
            pool,
            &identity.user_id,
            &tags,
            crate::capabilities::tryit_conversions::Event::Signup,
        )
        .await
        .unwrap_or_else(|error| {
            tracing::warn!(target: TRACE_TARGET, %error, "tryit sign-up not queued");
            false
        });
        if queued {
            crate::capabilities::tryit_conversions::report_now(
                pool,
                state.tryit.as_ref(),
                &identity.user_id,
            )
            .await;
        }
    }
    Response::ok(RecordSignupAttributionResponse {
        recorded,
        ..Default::default()
    })
}
