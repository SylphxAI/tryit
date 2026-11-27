//! Native Connect BillingService (Puzzled Plus), backed by Sylphx Money.
//!
//! Identity comes from the Platform JWT; guests can read the price list only.
//! Prices, checkout, portal, subscriptions and access are Money's; Puzzled
//! keeps the family membership list and the checkout consent.

use std::sync::Arc;

use connectrpc::{
    ConnectError, Encodable, ErrorCode, RequestContext, ServiceRequest, ServiceResult,
};
use sqlx::PgPool;
use tracing::warn;

use super::identity::require_identity;
use super::state::AppState;
use crate::capabilities::billing::service;
use crate::capabilities::identity_access::adapters::{
    auth_subjects, platform_jwt::VerifiedIdentity,
};
use crate::capabilities::money::Money;
use crate::proto::puzzled::v1::{
    BillingService, CancelSubscriptionRequest, CancelSubscriptionResponse, ClaimCheckoutRequest,
    ClaimCheckoutResponse, CreateCheckoutAttemptRequest, CreateCheckoutAttemptResponse,
    CreateCheckoutRequest, CreateCheckoutResponse, CreatePortalRequest, CreatePortalResponse,
    GetCheckoutRequest, GetCheckoutResponse, GetPassEligibilityRequest, GetPassEligibilityResponse,
    GetSubscriptionRequest, GetSubscriptionResponse, JoinFamilyRequest, JoinFamilyResponse,
    LeaveFamilyRequest, LeaveFamilyResponse, ListPlansRequest, ListPlansResponse,
    RemoveFamilyMemberRequest, RemoveFamilyMemberResponse, ResetFamilyInviteRequest,
    ResetFamilyInviteResponse, ResumeSubscriptionRequest, ResumeSubscriptionResponse,
};

mod catalog;
mod checkout;
mod checkout_attempt;
mod checkout_claim;
mod family;
mod pass_eligibility;
mod subscription;

#[cfg(test)]
mod tests;

// Preserve the tracing filter target for logs moved into child modules.
const LOG_TARGET: &str = module_path!();

#[derive(Clone)]
pub struct BillingConnectService {
    state: AppState,
}

impl BillingConnectService {
    pub fn new(state: AppState) -> Self {
        Self { state }
    }

    /// Money and the database, or `sales_closed`.
    fn store(&self) -> Result<(&PgPool, &Money), ConnectError> {
        match (&self.state.pool, &self.state.money) {
            (Some(pool), Some(money)) => Ok((pool, money)),
            _ => Err(ConnectError::new(
                ErrorCode::FailedPrecondition,
                "sales_closed",
            )),
        }
    }

    /// The database alone, for what needs no processor call (family, Money).
    fn pool(&self) -> Result<&PgPool, ConnectError> {
        self.state
            .pool
            .as_ref()
            .ok_or_else(|| ConnectError::new(ErrorCode::FailedPrecondition, "sales_closed"))
    }

    async fn player_subjects(&self, user_id: &str) -> Vec<String> {
        match &self.state.pool {
            Some(pool) => auth_subjects::money_subjects_for_player(pool, user_id).await,
            None => vec![user_id.to_string()],
        }
    }
}

pub fn billing_connect_service(state: AppState) -> Arc<BillingConnectService> {
    Arc::new(BillingConnectService::new(state))
}

fn internal(context: &'static str) -> impl FnOnce(String) -> ConnectError {
    move |error| {
        warn!(%error, context, "billing failed");
        ConnectError::new(ErrorCode::Unavailable, context)
    }
}

/// A Platform account; a guest-day id cannot hold a subscription.
fn account(ctx: &RequestContext) -> Result<VerifiedIdentity, ConnectError> {
    let identity = require_identity(ctx)?;
    if service::is_account_id(&identity.user_id) {
        Ok(identity)
    } else {
        Err(ConnectError::new(
            ErrorCode::Unauthenticated,
            "account_required",
        ))
    }
}

impl BillingService for BillingConnectService {
    async fn list_plans<'a>(
        &'a self,
        _ctx: RequestContext,
        _request: ServiceRequest<'_, ListPlansRequest>,
    ) -> ServiceResult<impl Encodable<ListPlansResponse> + Send + use<'a>> {
        catalog::list_plans(self).await
    }

    async fn get_subscription<'a>(
        &'a self,
        ctx: RequestContext,
        request: ServiceRequest<'_, GetSubscriptionRequest>,
    ) -> ServiceResult<impl Encodable<GetSubscriptionResponse> + Send + use<'a>> {
        subscription::get_subscription(self, ctx, request).await
    }

    async fn get_pass_eligibility<'a>(
        &'a self,
        ctx: RequestContext,
        _request: ServiceRequest<'_, GetPassEligibilityRequest>,
    ) -> ServiceResult<impl Encodable<GetPassEligibilityResponse> + Send + use<'a>> {
        pass_eligibility::get(self, ctx).await
    }

    async fn create_checkout<'a>(
        &'a self,
        ctx: RequestContext,
        request: ServiceRequest<'_, CreateCheckoutRequest>,
    ) -> ServiceResult<impl Encodable<CreateCheckoutResponse> + Send + use<'a>> {
        checkout::create_checkout(self, ctx, request).await
    }

    async fn create_checkout_attempt<'a>(
        &'a self,
        ctx: RequestContext,
        request: ServiceRequest<'_, CreateCheckoutAttemptRequest>,
    ) -> ServiceResult<impl Encodable<CreateCheckoutAttemptResponse> + Send + use<'a>> {
        checkout_attempt::create_checkout_attempt(self, ctx, request).await
    }

    async fn get_checkout<'a>(
        &'a self,
        ctx: RequestContext,
        request: ServiceRequest<'_, GetCheckoutRequest>,
    ) -> ServiceResult<impl Encodable<GetCheckoutResponse> + Send + use<'a>> {
        checkout_attempt::get_checkout(self, ctx, request).await
    }

    async fn claim_checkout<'a>(
        &'a self,
        ctx: RequestContext,
        request: ServiceRequest<'_, ClaimCheckoutRequest>,
    ) -> ServiceResult<impl Encodable<ClaimCheckoutResponse> + Send + use<'a>> {
        checkout_claim::claim_checkout(self, ctx, request).await
    }

    async fn create_portal<'a>(
        &'a self,
        ctx: RequestContext,
        request: ServiceRequest<'_, CreatePortalRequest>,
    ) -> ServiceResult<impl Encodable<CreatePortalResponse> + Send + use<'a>> {
        subscription::create_portal(self, ctx, request).await
    }

    async fn cancel_subscription<'a>(
        &'a self,
        ctx: RequestContext,
        _request: ServiceRequest<'_, CancelSubscriptionRequest>,
    ) -> ServiceResult<impl Encodable<CancelSubscriptionResponse> + Send + use<'a>> {
        subscription::cancel_subscription(self, ctx).await
    }

    async fn resume_subscription<'a>(
        &'a self,
        ctx: RequestContext,
        _request: ServiceRequest<'_, ResumeSubscriptionRequest>,
    ) -> ServiceResult<impl Encodable<ResumeSubscriptionResponse> + Send + use<'a>> {
        subscription::resume_subscription(self, ctx).await
    }

    async fn join_family<'a>(
        &'a self,
        ctx: RequestContext,
        request: ServiceRequest<'_, JoinFamilyRequest>,
    ) -> ServiceResult<impl Encodable<JoinFamilyResponse> + Send + use<'a>> {
        family::join_family(self, ctx, request).await
    }

    async fn leave_family<'a>(
        &'a self,
        ctx: RequestContext,
        _request: ServiceRequest<'_, LeaveFamilyRequest>,
    ) -> ServiceResult<impl Encodable<LeaveFamilyResponse> + Send + use<'a>> {
        family::leave_family(self, ctx).await
    }

    async fn remove_family_member<'a>(
        &'a self,
        ctx: RequestContext,
        request: ServiceRequest<'_, RemoveFamilyMemberRequest>,
    ) -> ServiceResult<impl Encodable<RemoveFamilyMemberResponse> + Send + use<'a>> {
        family::remove_family_member(self, ctx, request).await
    }

    async fn reset_family_invite<'a>(
        &'a self,
        ctx: RequestContext,
        _request: ServiceRequest<'_, ResetFamilyInviteRequest>,
    ) -> ServiceResult<impl Encodable<ResetFamilyInviteResponse> + Send + use<'a>> {
        family::reset_family_invite(self, ctx).await
    }
}
