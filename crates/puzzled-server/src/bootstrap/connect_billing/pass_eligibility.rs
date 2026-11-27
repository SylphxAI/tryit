use axum::http::header::{CACHE_CONTROL, COOKIE};
use connectrpc::{ConnectError, ErrorCode, RequestContext, Response, ServiceResult};

use super::{internal, BillingConnectService};
use crate::bootstrap::identity::require_purchase_allowed;
use crate::capabilities::billing::service;
use crate::capabilities::identity_access::adapters::auth_session::verified_identity;
use crate::capabilities::money::{claim_cookie::CHECKOUT_CLAIM_COOKIE, pricing};
use crate::proto::puzzled::v1::GetPassEligibilityResponse;

pub(super) async fn get(
    billing: &BillingConnectService,
    ctx: RequestContext,
) -> ServiceResult<GetPassEligibilityResponse> {
    // Only the route's read-only Auth middleware supplies this identity.
    let identity = verified_identity(ctx.headers())
        .ok_or_else(|| ConnectError::new(ErrorCode::Unauthenticated, "account_required"))?;
    require_purchase_allowed(&identity)?;
    let pending_claim = ctx.headers().get_all(COOKIE).iter().any(|value| {
        value.to_str().ok().is_none_or(|value| {
            value
                .split(';')
                .any(|pair| pair.split('=').next().map(str::trim) == Some(CHECKOUT_CLAIM_COOKIE))
        })
    });
    let mut known_free = false;
    if !pending_claim {
        let (pool, money) = billing.store()?;
        const UNAVAILABLE: &str = "pass_eligibility_unavailable";
        let catalog = money
            .catalog()
            .await
            .map_err(|error| internal(UNAVAILABLE)(error.to_string()))?;
        if pricing::plan(&catalog, "individual_once")
            .is_some_and(|pass| pass.prices.iter().any(|(_, amount)| *amount > 0))
        {
            known_free = service::known_free(
                pool,
                money,
                &identity.user_id,
                service::reverse_trial_enabled(),
            )
            .await
            .map_err(internal(UNAVAILABLE))?;
        }
    }
    Ok(Response::new(GetPassEligibilityResponse {
        known_free,
        ..Default::default()
    })
    .try_with_header(CACHE_CONTROL, "private, no-store")?)
}
