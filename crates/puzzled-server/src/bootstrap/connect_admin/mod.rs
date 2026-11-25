//! Native Connect AdminService (ADR-170). Every method requires a verified
//! Auth principal with the product customer organization's live admin role.

use std::sync::Arc;

use connectrpc::{ConnectError, ErrorCode, RequestContext, ServiceRequest, ServiceResult};

use super::state::AppState;
use crate::proto::puzzled::v1::{
    AdminService, CreateAnnouncementRequest, CreateAnnouncementResponse, DeleteAnnouncementRequest,
    DeleteAnnouncementResponse, GamesOverviewRequest, GamesOverviewResponse, GetAuditLogRequest,
    GetAuditLogResponse, GetGameAnalyticsRequest, GetGameAnalyticsResponse,
    GetMetricsReportRequest, GetMetricsReportResponse, GetSettingsRequest, GetSettingsResponse,
    ListAnnouncementsRequest, ListAnnouncementsResponse, ListAuditLogsRequest,
    ListAuditLogsResponse, ListDlqRequest, ListDlqResponse, MarkDlqFailedRequest,
    MarkDlqFailedResponse, ResolveDlqRequest, ResolveDlqResponse, RetryDlqRequest,
    RetryDlqResponse, SystemHealthRequest, SystemHealthResponse, UpdateAnnouncementRequest,
    UpdateAnnouncementResponse, UpdateSettingsRequest, UpdateSettingsResponse,
};

mod announcements;
mod audit_logs;
mod dlq;
mod game_analytics;
mod health;
mod metrics;
mod settings;

#[cfg(test)]
mod announcement_mapping_tests;

#[derive(Clone)]
pub struct AdminConnectService {
    state: AppState,
}

impl AdminConnectService {
    pub fn new(state: AppState) -> Self {
        Self { state }
    }

    fn pool(&self) -> Result<&sqlx::PgPool, ConnectError> {
        self.state
            .pool
            .as_ref()
            .ok_or_else(|| ConnectError::new(ErrorCode::Unavailable, "database_unavailable"))
    }
}

#[allow(refining_impl_trait_internal, refining_impl_trait_reachable)]
impl AdminService for AdminConnectService {
    async fn get_metrics_report(
        &self,
        ctx: RequestContext,
        _request: ServiceRequest<'_, GetMetricsReportRequest>,
    ) -> ServiceResult<GetMetricsReportResponse> {
        metrics::get_metrics_report(self, ctx).await
    }

    async fn list_announcements(
        &self,
        ctx: RequestContext,
        _request: ServiceRequest<'_, ListAnnouncementsRequest>,
    ) -> ServiceResult<ListAnnouncementsResponse> {
        announcements::list_announcements(self, ctx).await
    }

    async fn create_announcement(
        &self,
        ctx: RequestContext,
        request: ServiceRequest<'_, CreateAnnouncementRequest>,
    ) -> ServiceResult<CreateAnnouncementResponse> {
        announcements::create_announcement(self, ctx, request).await
    }

    async fn update_announcement(
        &self,
        ctx: RequestContext,
        request: ServiceRequest<'_, UpdateAnnouncementRequest>,
    ) -> ServiceResult<UpdateAnnouncementResponse> {
        announcements::update_announcement(self, ctx, request).await
    }

    async fn delete_announcement(
        &self,
        ctx: RequestContext,
        request: ServiceRequest<'_, DeleteAnnouncementRequest>,
    ) -> ServiceResult<DeleteAnnouncementResponse> {
        announcements::delete_announcement(self, ctx, request).await
    }

    async fn get_settings(
        &self,
        ctx: RequestContext,
        _request: ServiceRequest<'_, GetSettingsRequest>,
    ) -> ServiceResult<GetSettingsResponse> {
        settings::get_settings(self, ctx).await
    }

    async fn update_settings(
        &self,
        ctx: RequestContext,
        request: ServiceRequest<'_, UpdateSettingsRequest>,
    ) -> ServiceResult<UpdateSettingsResponse> {
        settings::update_settings(self, ctx, request).await
    }

    async fn list_audit_logs(
        &self,
        ctx: RequestContext,
        request: ServiceRequest<'_, ListAuditLogsRequest>,
    ) -> ServiceResult<ListAuditLogsResponse> {
        audit_logs::list_audit_logs(self, ctx, request).await
    }

    async fn get_audit_log(
        &self,
        ctx: RequestContext,
        request: ServiceRequest<'_, GetAuditLogRequest>,
    ) -> ServiceResult<GetAuditLogResponse> {
        audit_logs::get_audit_log(self, ctx, request).await
    }

    async fn list_dlq(
        &self,
        ctx: RequestContext,
        request: ServiceRequest<'_, ListDlqRequest>,
    ) -> ServiceResult<ListDlqResponse> {
        dlq::list_dlq(self, ctx, request).await
    }

    async fn retry_dlq(
        &self,
        ctx: RequestContext,
        request: ServiceRequest<'_, RetryDlqRequest>,
    ) -> ServiceResult<RetryDlqResponse> {
        dlq::retry_dlq(self, ctx, request).await
    }

    async fn resolve_dlq(
        &self,
        ctx: RequestContext,
        request: ServiceRequest<'_, ResolveDlqRequest>,
    ) -> ServiceResult<ResolveDlqResponse> {
        dlq::resolve_dlq(self, ctx, request).await
    }

    async fn mark_dlq_failed(
        &self,
        ctx: RequestContext,
        request: ServiceRequest<'_, MarkDlqFailedRequest>,
    ) -> ServiceResult<MarkDlqFailedResponse> {
        dlq::mark_dlq_failed(self, ctx, request).await
    }

    async fn games_overview(
        &self,
        ctx: RequestContext,
        _request: ServiceRequest<'_, GamesOverviewRequest>,
    ) -> ServiceResult<GamesOverviewResponse> {
        game_analytics::games_overview(self, ctx).await
    }

    async fn get_game_analytics(
        &self,
        ctx: RequestContext,
        request: ServiceRequest<'_, GetGameAnalyticsRequest>,
    ) -> ServiceResult<GetGameAnalyticsResponse> {
        game_analytics::get_game_analytics(self, ctx, request).await
    }

    async fn system_health(
        &self,
        ctx: RequestContext,
        _request: ServiceRequest<'_, SystemHealthRequest>,
    ) -> ServiceResult<SystemHealthResponse> {
        health::system_health(self, ctx).await
    }
}

pub fn admin_connect_service(state: AppState) -> Arc<AdminConnectService> {
    Arc::new(AdminConnectService::new(state))
}
