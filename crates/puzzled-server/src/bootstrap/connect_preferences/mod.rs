//! Native Connect PreferencesService (ADR-170). Identity from the Bearer JWT.

use std::sync::Arc;

use connectrpc::{RequestContext, ServiceRequest, ServiceResult};

use super::state::AppState;
use crate::proto::puzzled::v1::{
    CheckUsernameRequest, CheckUsernameResponse, DeleteAccountDataRequest,
    DeleteAccountDataResponse, GetNotificationPreferencesRequest,
    GetNotificationPreferencesResponse, GetProfileRequest, GetProfileResponse,
    GetWebPushConfigRequest, GetWebPushConfigResponse, PreferencesService,
    RecordSignupAttributionRequest, RecordSignupAttributionResponse,
    SaveWebPushSubscriptionRequest, SaveWebPushSubscriptionResponse, UnsubscribeEmailRequest,
    UnsubscribeEmailResponse, UpdateEmailPreferencesRequest, UpdateEmailPreferencesResponse,
    UpdateProfileRequest, UpdateProfileResponse, UpdatePushPreferencesRequest,
    UpdatePushPreferencesResponse,
};

mod account_deletion;
mod notifications;
mod profile;
mod signup_attribution;
mod web_push;

// Keep the original service target for all events emitted by the handlers.
const TRACE_TARGET: &str = module_path!();

#[derive(Clone)]
pub struct PreferencesConnectService {
    state: AppState,
}

impl PreferencesConnectService {
    pub fn new(state: AppState) -> Self {
        Self { state }
    }
}

#[allow(refining_impl_trait_internal, refining_impl_trait_reachable)]
impl PreferencesService for PreferencesConnectService {
    async fn get_web_push_config(
        &self,
        _ctx: RequestContext,
        _request: ServiceRequest<'_, GetWebPushConfigRequest>,
    ) -> ServiceResult<GetWebPushConfigResponse> {
        web_push::get_web_push_config(_ctx, _request).await
    }

    async fn save_web_push_subscription(
        &self,
        ctx: RequestContext,
        request: ServiceRequest<'_, SaveWebPushSubscriptionRequest>,
    ) -> ServiceResult<SaveWebPushSubscriptionResponse> {
        web_push::save_web_push_subscription(&self.state, ctx, request).await
    }

    async fn get_profile(
        &self,
        ctx: RequestContext,
        _request: ServiceRequest<'_, GetProfileRequest>,
    ) -> ServiceResult<GetProfileResponse> {
        profile::get_profile(&self.state, ctx, _request).await
    }

    async fn update_profile(
        &self,
        ctx: RequestContext,
        request: ServiceRequest<'_, UpdateProfileRequest>,
    ) -> ServiceResult<UpdateProfileResponse> {
        profile::update_profile(&self.state, ctx, request).await
    }

    async fn check_username(
        &self,
        ctx: RequestContext,
        request: ServiceRequest<'_, CheckUsernameRequest>,
    ) -> ServiceResult<CheckUsernameResponse> {
        profile::check_username(&self.state, ctx, request).await
    }

    async fn get_notification_preferences(
        &self,
        ctx: RequestContext,
        _request: ServiceRequest<'_, GetNotificationPreferencesRequest>,
    ) -> ServiceResult<GetNotificationPreferencesResponse> {
        notifications::get_notification_preferences(&self.state, ctx, _request).await
    }

    async fn update_push_preferences(
        &self,
        ctx: RequestContext,
        request: ServiceRequest<'_, UpdatePushPreferencesRequest>,
    ) -> ServiceResult<UpdatePushPreferencesResponse> {
        notifications::update_push_preferences(&self.state, ctx, request).await
    }

    async fn unsubscribe_email(
        &self,
        _ctx: RequestContext,
        request: ServiceRequest<'_, UnsubscribeEmailRequest>,
    ) -> ServiceResult<UnsubscribeEmailResponse> {
        notifications::unsubscribe_email(&self.state, _ctx, request).await
    }

    async fn update_email_preferences(
        &self,
        ctx: RequestContext,
        request: ServiceRequest<'_, UpdateEmailPreferencesRequest>,
    ) -> ServiceResult<UpdateEmailPreferencesResponse> {
        notifications::update_email_preferences(&self.state, ctx, request).await
    }

    async fn delete_account_data(
        &self,
        ctx: RequestContext,
        request: ServiceRequest<'_, DeleteAccountDataRequest>,
    ) -> ServiceResult<DeleteAccountDataResponse> {
        account_deletion::delete_account_data(&self.state, ctx, request).await
    }

    async fn record_signup_attribution(
        &self,
        ctx: RequestContext,
        _request: ServiceRequest<'_, RecordSignupAttributionRequest>,
    ) -> ServiceResult<RecordSignupAttributionResponse> {
        signup_attribution::record_signup_attribution(&self.state, ctx, _request).await
    }
}

pub fn preferences_connect_service(state: AppState) -> Arc<PreferencesConnectService> {
    Arc::new(PreferencesConnectService::new(state))
}
