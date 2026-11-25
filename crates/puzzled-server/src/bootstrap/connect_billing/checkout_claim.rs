use connectrpc::{
    ConnectError, ErrorCode, RequestContext, Response, ServiceRequest, ServiceResult,
};
use sqlx::PgPool;
use tracing::warn;

use super::super::identity::require_purchase_allowed;
use super::{account, internal, BillingConnectService, LOG_TARGET};
use crate::capabilities::identity_access::adapters::auth_session;
use crate::capabilities::money::{claim_cookie, consent_db, pricing, Money, MoneyError};
use crate::proto::puzzled::v1::{ClaimCheckoutRequest, ClaimCheckoutResponse};

pub(super) async fn claim_checkout(
    billing: &BillingConnectService,
    ctx: RequestContext,
    request: ServiceRequest<'_, ClaimCheckoutRequest>,
) -> ServiceResult<ClaimCheckoutResponse> {
    let identity = account(&ctx)?;
    require_purchase_allowed(&identity)?;
    let (pool, money) = billing.store()?;
    let req = request.to_owned_message();
    let requested_id = req.checkout_session_id.trim().to_string();
    let req_locale = req.locale.trim().to_string();
    let entries = claim_cookie::read_entries(ctx.headers());
    let session_tok = auth_session::session_token(ctx.headers());
    let secure = money.public_url().starts_with("https://");

    if requested_id.is_empty() {
        if entries.is_empty() {
            return Response::ok(ClaimCheckoutResponse {
                claimed: false,
                ..Default::default()
            });
        }
        let mut remaining = Vec::new();
        let mut any_claimed = false;
        for entry in &entries {
            let lookup_id = entry.lookup_id();
            if lookup_id.is_empty() {
                continue;
            }
            match money
                .claim_checkout_session(
                    lookup_id,
                    &identity.user_id,
                    Some(entry.sec.as_str()),
                    session_tok.as_deref(),
                )
                .await
            {
                Ok(claimed) => {
                    any_claimed = true;
                    let loc = if !entry.loc.is_empty() {
                        entry.loc.as_str()
                    } else {
                        req_locale.as_str()
                    };
                    record_claimed_consent(
                        pool,
                        money,
                        &identity.user_id,
                        (!entry.plan.is_empty())
                            .then(|| entry.plan.clone())
                            .or(claimed.plan_id),
                        (!entry.price.is_empty()).then(|| entry.price.clone()),
                        loc,
                    )
                    .await;
                }
                Err(MoneyError::Refused {
                    status: 403 | 404 | 409,
                    ..
                }) => {
                    // Terminal for this secret (consumed, expired, or bound elsewhere): prune it.
                }
                Err(MoneyError::Refused { .. } | MoneyError::Unavailable(_)) => {
                    remaining.push(entry.clone());
                }
            }
        }
        let reply = ClaimCheckoutResponse {
            claimed: any_claimed,
            ..Default::default()
        };
        if remaining.len() != entries.len() {
            if let Ok(cookie_header) = claim_cookie::format_set_cookie(&remaining, secure) {
                if let Ok(resp) = Response::new(reply.clone())
                    .try_with_header(axum::http::header::SET_COOKIE, cookie_header)
                {
                    return Ok(resp);
                }
            }
        }
        return Response::ok(reply);
    }

    if requested_id.len() > 128
        || !requested_id
            .bytes()
            .all(|b| b.is_ascii_alphanumeric() || b == b'_' || b == b'-')
    {
        return Err(ConnectError::new(
            ErrorCode::InvalidArgument,
            "checkout_session_invalid",
        ));
    }

    let matched = claim_cookie::find_entry(&entries, &requested_id).cloned();
    let outcome = money
        .claim_checkout_session(
            &requested_id,
            &identity.user_id,
            matched.as_ref().map(|e| e.sec.as_str()),
            session_tok.as_deref(),
        )
        .await;

    match outcome {
        Ok(claimed) => {
            let loc = matched
                .as_ref()
                .map(|e| e.loc.as_str())
                .filter(|s| !s.is_empty())
                .unwrap_or(req_locale.as_str());
            record_claimed_consent(
                pool,
                money,
                &identity.user_id,
                matched
                    .as_ref()
                    .and_then(|e| (!e.plan.is_empty()).then(|| e.plan.clone()))
                    .or(claimed.plan_id),
                matched
                    .as_ref()
                    .and_then(|e| (!e.price.is_empty()).then(|| e.price.clone())),
                loc,
            )
            .await;
            let reply = ClaimCheckoutResponse {
                claimed: true,
                ..Default::default()
            };
            if matched.is_some() {
                let updated = claim_cookie::remove_entry(entries, &requested_id);
                if let Ok(cookie_header) = claim_cookie::format_set_cookie(&updated, secure) {
                    if let Ok(resp) = Response::new(reply.clone())
                        .try_with_header(axum::http::header::SET_COOKIE, cookie_header)
                    {
                        return Ok(resp);
                    }
                }
            }
            Response::ok(reply)
        }
        Err(MoneyError::Refused { status: 409, .. }) => Err(ConnectError::new(
            ErrorCode::AlreadyExists,
            "checkout_already_claimed",
        )),
        Err(MoneyError::Refused { status: 404, .. }) => {
            Err(ConnectError::new(ErrorCode::NotFound, "checkout_not_found"))
        }
        Err(MoneyError::Refused {
            status: 401 | 403, ..
        }) => Err(ConnectError::new(
            ErrorCode::PermissionDenied,
            "claim_denied",
        )),
        Err(MoneyError::Refused {
            status: 400 | 422, ..
        }) => Err(ConnectError::new(
            ErrorCode::InvalidArgument,
            "checkout_session_invalid",
        )),
        Err(error) => Err(internal("claim_unavailable")(error.to_string())),
    }
}

async fn record_claimed_consent(
    pool: &PgPool,
    money: &Money,
    user_id: &str,
    plan_id: Option<String>,
    price_key: Option<String>,
    locale: &str,
) {
    let Some(pid) = plan_id.filter(|s| !s.is_empty()) else {
        return;
    };
    let catalog_plan = money
        .catalog()
        .await
        .ok()
        .and_then(|c| pricing::plan(&c, &pid));
    let one_time_pass = catalog_plan.as_ref().map_or_else(
        || pid.ends_with("_once"),
        pricing::PlanPrices::is_one_time_pass,
    );
    let resolved_price = price_key
        .filter(|s| !s.is_empty())
        .or_else(|| catalog_plan.map(|p| p.price_key));
    if let Some(pk) = resolved_price {
        let locale_val = if locale.is_empty() { "en-US" } else { locale };
        if let Err(error) =
            consent_db::record(pool, user_id, &pid, &pk, locale_val, one_time_pass).await
        {
            warn!(target: LOG_TARGET, %error, "post-claim consent audit insert failed");
        }
    }
}
