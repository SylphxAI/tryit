use connectrpc::{
    ConnectError, ErrorCode, RequestContext, Response, ServiceRequest, ServiceResult,
};

use super::checkout::checkout_url;
use super::{account, BillingConnectService};
use crate::proto::puzzled::v1::{
    CreateCheckoutAttemptRequest, CreateCheckoutAttemptResponse, CreateCheckoutRequest,
    GetCheckoutRequest, GetCheckoutResponse,
};

pub(super) async fn create_checkout_attempt(
    billing: &BillingConnectService,
    ctx: RequestContext,
    request: ServiceRequest<'_, CreateCheckoutAttemptRequest>,
) -> ServiceResult<CreateCheckoutAttemptResponse> {
    let req = request.to_owned_message();
    if uuid::Uuid::parse_str(&req.request_id).is_err() {
        return Err(ConnectError::new(
            ErrorCode::InvalidArgument,
            "request_id_invalid",
        ));
    }
    let url = checkout_url(
        billing,
        ctx,
        CreateCheckoutRequest {
            plan_id: req.plan_id,
            locale: req.locale,
            currency: req.currency,
            immediate_supply_consent: req.immediate_supply_consent,
            ..Default::default()
        },
        Some(&req.request_id),
    )
    .await?;
    Response::ok(CreateCheckoutAttemptResponse {
        url,
        ..Default::default()
    })
}

pub(super) async fn get_checkout(
    billing: &BillingConnectService,
    ctx: RequestContext,
    request: ServiceRequest<'_, GetCheckoutRequest>,
) -> ServiceResult<GetCheckoutResponse> {
    let identity = account(&ctx)?;
    let (pool, money) = billing.store()?;
    let req = request.to_owned_message();
    let fixture: Option<String> =
        sqlx::query_scalar("SELECT fixture_key FROM synthetic_fixtures WHERE user_id=$1::uuid")
            .bind(&identity.user_id)
            .fetch_optional(pool)
            .await
            .map_err(|_| ConnectError::new(ErrorCode::Unavailable, "checkout_unavailable"))?;
    let attempt = crate::capabilities::money::attempts::get(
        pool,
        money,
        &identity.user_id,
        (!req.request_id.is_empty()).then_some(req.request_id.as_str()),
    )
    .await
    .map_err(|error| {
        ConnectError::new(
            if matches!(
                error,
                crate::capabilities::money::attempts::Error::InvalidRequest
            ) {
                ErrorCode::InvalidArgument
            } else {
                ErrorCode::Unavailable
            },
            "checkout_unavailable",
        )
    })?;
    let mut response = GetCheckoutResponse {
        state: "absent".into(),
        synthetic_fixture: fixture.unwrap_or_default(),
        ..Default::default()
    };
    if let Some(attempt) = attempt {
        response.request_id = attempt.request_id;
        response.state = attempt.state;
        if let Some(session) = attempt.session {
            let text = |key| {
                session
                    .get(key)
                    .and_then(serde_json::Value::as_str)
                    .unwrap_or_default()
                    .to_owned()
            };
            response.money_session_name = text("name");
            response.url = text("url");
            response.processor_session_id = text("processor_session_id");
            response.session_state = text("state");
        }
    }
    Response::ok(response)
}
