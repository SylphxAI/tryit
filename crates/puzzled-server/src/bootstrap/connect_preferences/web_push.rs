use connectrpc::{
    ConnectError, ErrorCode, RequestContext, Response, ServiceRequest, ServiceResult,
};
use uuid::Uuid;

use crate::bootstrap::identity::require_identity;
use crate::bootstrap::state::AppState;
use crate::proto::puzzled::v1::{
    GetWebPushConfigRequest, GetWebPushConfigResponse, SaveWebPushSubscriptionRequest,
    SaveWebPushSubscriptionResponse,
};

pub(super) async fn get_web_push_config(
    _ctx: RequestContext,
    _request: ServiceRequest<'_, GetWebPushConfigRequest>,
) -> ServiceResult<GetWebPushConfigResponse> {
    Response::ok(GetWebPushConfigResponse {
        public_key: std::env::var("VAPID_PUBLIC_KEY").unwrap_or_default(),
        ..Default::default()
    })
}

pub(super) async fn save_web_push_subscription(
    state: &AppState,
    ctx: RequestContext,
    request: ServiceRequest<'_, SaveWebPushSubscriptionRequest>,
) -> ServiceResult<SaveWebPushSubscriptionResponse> {
    use crate::capabilities::preferences::adapters::web_push;
    let identity = require_identity(&ctx)?;
    let player = Uuid::parse_str(&identity.user_id)
        .map_err(|_| ConnectError::new(ErrorCode::Internal, "invalid_player"))?;
    let req = request.to_owned_message();
    if !web_push::valid_endpoint(&req.endpoint)
        || (!req.remove && !web_push::valid_keys(&req.p256dh, &req.auth))
        || (!req.locale.is_empty()
            && !matches!(
                req.locale.as_str(),
                "en-US" | "en-GB" | "zh-HK" | "zh-TW" | "zh-CN" | "ja" | "es" | "pt-BR"
            ))
    {
        return Err(ConnectError::new(
            ErrorCode::InvalidArgument,
            "invalid_push_subscription",
        ));
    }
    let pool = state
        .pool
        .as_ref()
        .ok_or_else(|| ConnectError::new(ErrorCode::Unavailable, "push_store_unavailable"))?;
    let result = if req.remove {
        web_push::remove(pool, player, &req.endpoint).await
    } else {
        web_push::save(
            pool,
            player,
            &req.endpoint,
            &req.p256dh,
            &req.auth,
            if req.locale.is_empty() {
                "en-US"
            } else {
                &req.locale
            },
        )
        .await
    };
    result.map_err(|error| match error {
        sqlx::Error::RowNotFound => {
            ConnectError::new(ErrorCode::NotFound, "push_subscription_not_found")
        }
        _ => ConnectError::new(ErrorCode::Internal, "push_subscription_save_failed"),
    })?;
    Response::ok(SaveWebPushSubscriptionResponse::default())
}
