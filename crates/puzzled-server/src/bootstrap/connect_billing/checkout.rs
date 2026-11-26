use connectrpc::{
    ConnectError, ErrorCode, RequestContext, Response, ServiceRequest, ServiceResult,
};

use super::super::identity::{self, require_purchase_allowed};
use super::{account, internal, BillingConnectService};
use crate::capabilities::billing::service;
use crate::capabilities::identity_access::adapters::platform_jwt::VerifiedIdentity;
use crate::capabilities::money::{
    checkout as money_checkout, checkout_attribution::CheckoutAttribution, claim_cookie,
    consent_db, pricing, CheckoutError, Money,
};
use crate::capabilities::preferences::adapters::attribution_db::attribution_for_user;
use crate::proto::puzzled::v1::{CreateCheckoutRequest, CreateCheckoutResponse};

pub(super) async fn create_checkout(
    billing: &BillingConnectService,
    ctx: RequestContext,
    request: ServiceRequest<'_, CreateCheckoutRequest>,
) -> ServiceResult<CreateCheckoutResponse> {
    let req = request.to_owned_message();
    if optional_account(&ctx)?.is_some() {
        let url = checkout_url(billing, ctx, req, None).await?;
        return Response::ok(CreateCheckoutResponse {
            url,
            ..Default::default()
        });
    }

    // Cold-guest checkout: validate plan-appropriate UK CCR disclosure
    // (Reg 37 14-day waiver strictly for one-time passes; Reg 36 for
    // recurring subscriptions), omit `subject` so Money allocates
    // `guest:{id}`, and keep the returned single-use `claim_secret`
    // strictly in an HttpOnly cookie.
    let (pool, money) = billing.store()?;
    let measurement = CheckoutAttribution::from_headers(ctx.headers());
    let return_to = ctx
        .headers()
        .get("x-puzzled-return-to")
        .and_then(|value| value.to_str().ok())
        .and_then(money_checkout::safe_return_to);
    let catalog = money
        .catalog()
        .await
        .map_err(|e| internal("checkout_unavailable")(e.to_string()))?;
    let plan_id = req.plan_id.trim();
    let found_plan = pricing::plan(&catalog, plan_id)
        .ok_or(CheckoutError::PlanNotOnSale)
        .map_err(map_checkout_error)?;
    let consent = money_checkout::Consent::for_plan(
        found_plan.is_one_time_pass(),
        req.immediate_supply_consent,
    )
    .map_err(map_checkout_error)?;
    let guest = money_checkout::create_guest_session(
        money,
        &catalog,
        plan_id,
        req.locale.trim(),
        &req.currency,
        measurement.money_tags(None).as_ref(),
        return_to.as_deref(),
        consent,
        measurement,
        Some(pool),
    )
    .await
    .map_err(map_checkout_error)?;

    let reply = CreateCheckoutResponse {
        url: guest.created.url,
        ..Default::default()
    };
    if let Some(secret) = guest.created.claim_secret {
        let entries = claim_cookie::append_entry(
            claim_cookie::read_entries(ctx.headers()),
            claim_cookie::ClaimCookieEntry {
                s: guest.created.processor_session_id,
                chk: guest.created.session_id,
                sec: secret,
                plan: guest.plan_id,
                price: guest.price_key,
                loc: guest.locale,
            },
        );
        let secure = money.public_url().starts_with("https://");
        if let Ok(cookie_header) = claim_cookie::format_set_cookie(&entries, secure) {
            if let Ok(resp) = Response::new(reply.clone())
                .try_with_header(axum::http::header::SET_COOKIE, cookie_header)
            {
                return Ok(resp);
            }
        }
    }
    Response::ok(reply)
}

pub(super) async fn checkout_url(
    billing: &BillingConnectService,
    ctx: RequestContext,
    req: CreateCheckoutRequest,
    request_id: Option<&str>,
) -> Result<String, ConnectError> {
    let identity = account(&ctx)?;
    require_purchase_allowed(&identity)?;
    let measurement = CheckoutAttribution::from_headers(ctx.headers());
    let return_to = ctx
        .headers()
        .get("x-puzzled-return-to")
        .and_then(|value| value.to_str().ok())
        .and_then(money_checkout::safe_return_to);
    let (_, money) = billing.store()?;
    let started = money_checkout(
        billing,
        money,
        &identity,
        &req,
        return_to.as_deref(),
        request_id,
        measurement,
    )
    .await;
    started.map_err(map_checkout_error)
}

/// A Money checkout: the buyer's consent is recorded, then the server
/// creates the session and the browser is sent to its hosted page.
async fn money_checkout(
    billing: &BillingConnectService,
    money: &Money,
    identity: &VerifiedIdentity,
    req: &CreateCheckoutRequest,
    return_to: Option<&str>,
    request_id: Option<&str>,
    measurement: CheckoutAttribution<'_>,
) -> Result<String, CheckoutError> {
    let pool = billing
        .state
        .pool
        .as_ref()
        .ok_or_else(|| CheckoutError::Failed("no database".into()))?;
    let plan_id = req.plan_id.trim();
    let locale = req.locale.trim();
    let catalog = money
        .catalog()
        .await
        .map_err(|e| CheckoutError::Failed(e.to_string()))?;
    let plan = pricing::plan(&catalog, plan_id).ok_or(CheckoutError::PlanNotOnSale)?;
    let consent =
        money_checkout::Consent::for_plan(plan.is_one_time_pass(), req.immediate_supply_consent)?;
    let stored = if measurement.analytics_granted() {
        attribution_for_user(pool, &identity.user_id)
            .await
            .map_err(CheckoutError::Failed)?
    } else {
        None
    };
    let attribution = measurement.money_tags(stored);
    consent_db::record(
        pool,
        &identity.user_id,
        plan_id,
        &plan.price_key,
        locale,
        plan.is_one_time_pass(),
    )
    .await
    .map_err(CheckoutError::Failed)?;
    if let Some(request_id) = request_id {
        return money_checkout::create_retained_session(
            pool,
            money,
            &catalog,
            &identity.user_id,
            request_id,
            plan_id,
            locale,
            &req.currency,
            attribution.as_ref(),
            return_to,
            consent,
            measurement,
        )
        .await;
    }
    money_checkout::create_session(
        money,
        &catalog,
        &identity.user_id,
        plan_id,
        locale,
        &req.currency,
        attribution.as_ref(),
        return_to,
        consent,
        measurement,
        Some(pool),
    )
    .await
}

fn map_checkout_error(err: CheckoutError) -> ConnectError {
    match err {
        CheckoutError::ConsentRequired => {
            ConnectError::new(ErrorCode::FailedPrecondition, "consent_required")
        }
        CheckoutError::PlanNotOnSale => {
            ConnectError::new(ErrorCode::FailedPrecondition, "plan_not_on_sale")
        }
        CheckoutError::AlreadySubscribed => {
            ConnectError::new(ErrorCode::AlreadyExists, "already_subscribed")
        }
        CheckoutError::InvalidRequest => {
            ConnectError::new(ErrorCode::InvalidArgument, "request_id_invalid")
        }
        CheckoutError::AttemptChanged => {
            ConnectError::new(ErrorCode::AlreadyExists, "checkout_request_changed")
        }
        CheckoutError::AttemptPending => {
            ConnectError::new(ErrorCode::Unavailable, "checkout_pending")
        }
        CheckoutError::Failed(error) => internal("checkout_unavailable")(error),
    }
}

/// Signed-in account when present; `Ok(None)` for an unauthenticated cold guest;
/// `Err` when an explicit invalid bearer/JWT credential was supplied.
fn optional_account(ctx: &RequestContext) -> Result<Option<VerifiedIdentity>, ConnectError> {
    match identity::verify(ctx.headers()) {
        Ok(identity) if service::is_account_id(&identity.user_id) => Ok(Some(identity)),
        Ok(_) => Ok(None),
        Err(err) if err.message.as_deref() == Some("identity_required") => Ok(None),
        Err(err) => Err(err),
    }
}
