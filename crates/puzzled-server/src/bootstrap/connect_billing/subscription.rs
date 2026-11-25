use connectrpc::{
    ConnectError, ErrorCode, RequestContext, Response, ServiceRequest, ServiceResult,
};

use super::super::identity::{require_identity, require_purchase_allowed};
use super::family::family_view;
use super::{account, internal, BillingConnectService, LOG_TARGET};
use crate::capabilities::billing::service;
use crate::capabilities::money::{
    checkout as money_checkout, client::Subscription, pricing, Money, MoneyError,
};
use crate::proto::puzzled::v1::{
    CancelSubscriptionResponse, CreatePortalRequest, CreatePortalResponse, GetSubscriptionRequest,
    GetSubscriptionResponse, ResumeSubscriptionResponse,
};

pub(super) async fn get_subscription(
    billing: &BillingConnectService,
    ctx: RequestContext,
    request: ServiceRequest<'_, GetSubscriptionRequest>,
) -> ServiceResult<GetSubscriptionResponse> {
    let identity = require_identity(&ctx)?;
    let mut response = GetSubscriptionResponse {
        sales_open: billing.state.sales_open().await,
        source: "none".to_string(),
        ..Default::default()
    };
    let (Some(pool), Some(money)) = (billing.state.pool.as_ref(), billing.state.money.as_ref())
    else {
        return Response::ok(response);
    };
    if !service::is_account_id(&identity.user_id) {
        return Response::ok(response);
    }
    if request.to_owned_message().refresh {
        for subj in billing.player_subjects(&identity.user_id).await {
            money.refresh_grants(&subj);
        }
    }
    let entitlement = service::access(pool, Some(money), &identity.user_id)
        .await
        .map_err(internal("subscription_unavailable"))?;
    response.entitled = entitlement.entitled;
    if let Some(owner) = &entitlement.family_owner {
        response.source = "family".to_string();
        response.family = family_view(billing, pool, owner, false).await?.into();
    } else if let Some(ends) = entitlement.trial_ends_ms {
        response.source = "trial".to_string();
        response.trial_ends_ms = Some(ends);
    } else if entitlement.entitled {
        response.source = "plus".to_string();
        // The subscription behind it, when there is one (a manual grant
        // has none). A read that fails leaves the access answer standing.
        if let Ok(subs) = player_subscriptions(billing, money, &identity.user_id).await {
            if let Some((_, sub)) = subs.iter().find(|(_, s)| s.live()) {
                // A Tryit-referred account's first paid subscription is
                // queued for Tryit (one row per account and event, so
                // this is idempotent). Money sends Puzzled no webhook,
                // so the page the buyer returns to is where it is
                // noticed. Failing to queue never fails the read.
                if let Err(error) = crate::capabilities::tryit_conversions::enqueue_purchase(
                    pool,
                    &identity.user_id,
                )
                .await
                {
                    tracing::warn!(target: LOG_TARGET, %error, "tryit purchase not queued");
                }
                let catalog = money.catalog().await.ok();
                let plan = catalog.as_deref().and_then(|c| {
                    pricing::plans(c)
                        .into_iter()
                        .find(|p| sub.price_keys.contains(&p.price_key))
                });
                response.status = Some(sub.status.clone());
                response.cancel_at_period_end = sub.cancel_at_period_end;
                response.current_period_end_ms =
                    sub.current_period_end.map(|t| t.timestamp_millis());
                response.subscription_trial_end_ms = sub.trial_end.map(|t| t.timestamp_millis());
                if let Some(plan) = plan {
                    response.plan_id = Some(plan.plan_id.clone());
                    if plan.family {
                        response.family = family_view(billing, pool, &identity.user_id, true)
                            .await?
                            .into();
                    }
                }
            }
        }
    }
    // An observation is not admission. Never make the response wait on
    // metric storage or another Money answer; unknown answers are excluded.
    let observed_pool = pool.clone();
    let observed_money = money.clone();
    let observed_user = identity.user_id.clone();
    let paid = matches!(response.source.as_str(), "plus" | "family");
    tokio::spawn(async move {
        if observed_money
            .try_check(
                &observed_user,
                crate::capabilities::money::access::FEATURE_PLUS,
            )
            .await
            .is_ok()
        {
            crate::capabilities::metrics::audience(&observed_pool, &observed_user, paid).await;
        }
    });
    Response::ok(response)
}

pub(super) async fn create_portal(
    billing: &BillingConnectService,
    ctx: RequestContext,
    request: ServiceRequest<'_, CreatePortalRequest>,
) -> ServiceResult<CreatePortalResponse> {
    let identity = account(&ctx)?;
    require_purchase_allowed(&identity)?;
    let (_, money) = billing.store()?;
    let req = request.to_owned_message();
    let subs = player_subscriptions(billing, money, &identity.user_id)
        .await
        .map_err(|e| internal("portal_unavailable")(e.to_string()))?;
    let Some((subj, sub)) = subs.iter().find(|(_, s)| s.live()).or_else(|| subs.first()) else {
        return Err(ConnectError::new(
            ErrorCode::FailedPrecondition,
            "no_billing_account",
        ));
    };
    let back = format!(
        "{}{}/settings/subscription",
        money.public_url(),
        money_checkout::locale_prefix(req.locale.trim())
    );
    let url = money
        .portal_url_for_subscription(subj, Some(&sub.id), &back)
        .await
        .map_err(|e| internal("portal_unavailable")(e.to_string()))?;
    Response::ok(CreatePortalResponse {
        url,
        ..Default::default()
    })
}

pub(super) async fn cancel_subscription(
    billing: &BillingConnectService,
    ctx: RequestContext,
) -> ServiceResult<CancelSubscriptionResponse> {
    let identity = account(&ctx)?;
    let (_, money) = billing.store()?;
    let subs = player_subscriptions(billing, money, &identity.user_id)
        .await
        .map_err(|e| internal("cancel_unavailable")(e.to_string()))?;
    let Some((_, sub)) = subs.iter().find(|(_, s)| s.renews()) else {
        return Err(ConnectError::new(
            ErrorCode::FailedPrecondition,
            "no_subscription",
        ));
    };
    // Access runs to the end of the paid period; no refund is promised.
    money
        .cancel_at_period_end(&sub.id)
        .await
        .map_err(|e| internal("cancel_unavailable")(e.to_string()))?;
    Response::ok(CancelSubscriptionResponse {
        access_ends_at_ms: sub.current_period_end.map_or(0, |t| t.timestamp_millis()),
        ..Default::default()
    })
}

pub(super) async fn resume_subscription(
    billing: &BillingConnectService,
    ctx: RequestContext,
) -> ServiceResult<ResumeSubscriptionResponse> {
    let identity = account(&ctx)?;
    require_purchase_allowed(&identity)?;
    let (_, money) = billing.store()?;
    let subs = player_subscriptions(billing, money, &identity.user_id)
        .await
        .map_err(|e| internal("resume_unavailable")(e.to_string()))?;
    let Some((_, sub)) = subs
        .iter()
        .find(|(_, s)| s.live() && s.cancel_at_period_end)
    else {
        return Err(ConnectError::new(
            ErrorCode::FailedPrecondition,
            "nothing_to_resume",
        ));
    };
    money
        .resume(&sub.id)
        .await
        .map_err(|e| internal("resume_unavailable")(e.to_string()))?;
    Response::ok(ResumeSubscriptionResponse::default())
}

async fn player_subscriptions(
    billing: &BillingConnectService,
    money: &Money,
    user_id: &str,
) -> Result<Vec<(String, Subscription)>, MoneyError> {
    let mut out: Vec<(String, Subscription)> = Vec::new();
    for subj in billing.player_subjects(user_id).await {
        for sub in money.subscriptions(&subj).await? {
            if !out.iter().any(|(_, existing)| existing.id == sub.id) {
                out.push((subj.clone(), sub));
            }
        }
    }
    Ok(out)
}
