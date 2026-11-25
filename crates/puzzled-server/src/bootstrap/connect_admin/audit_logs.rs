use connectrpc::{
    ConnectError, ErrorCode, RequestContext, Response, ServiceRequest, ServiceResult,
};
use serde_json::Value;

use super::super::identity::require_admin;
use super::AdminConnectService;
use crate::capabilities::admin::adapters::admin_db;
use crate::proto::puzzled::v1::{
    AuditLogEntry, GetAuditLogRequest, GetAuditLogResponse, ListAuditLogsRequest,
    ListAuditLogsResponse,
};

fn audit_from_json(v: &Value) -> AuditLogEntry {
    AuditLogEntry {
        id: v
            .get("id")
            .and_then(|x| x.as_str())
            .unwrap_or_default()
            .to_string(),
        user_id: v
            .get("userId")
            .and_then(|x| x.as_str())
            .unwrap_or_default()
            .to_string(),
        actor_id: v
            .get("actorId")
            .and_then(|x| x.as_str())
            .unwrap_or_default()
            .to_string(),
        action: v
            .get("action")
            .and_then(|x| x.as_str())
            .unwrap_or_default()
            .to_string(),
        entity_type: v
            .get("entityType")
            .and_then(|x| x.as_str())
            .unwrap_or_default()
            .to_string(),
        entity_id: v
            .get("entityId")
            .and_then(|x| x.as_str())
            .unwrap_or_default()
            .to_string(),
        metadata_json: v
            .get("metadataJson")
            .and_then(|x| x.as_str())
            .unwrap_or_default()
            .to_string(),
        created_at: v
            .get("createdAt")
            .and_then(|x| x.as_str())
            .unwrap_or_default()
            .to_string(),
        ip_address: v
            .get("ipAddress")
            .and_then(|x| x.as_str())
            .unwrap_or_default()
            .to_string(),
        user_agent: v
            .get("userAgent")
            .and_then(|x| x.as_str())
            .unwrap_or_default()
            .to_string(),
        ..Default::default()
    }
}

pub(super) async fn list_audit_logs(
    admin: &AdminConnectService,
    ctx: RequestContext,
    request: ServiceRequest<'_, ListAuditLogsRequest>,
) -> ServiceResult<ListAuditLogsResponse> {
    require_admin(&ctx, &admin.state.auth).await?;
    let pool = admin.pool()?;
    let req = request.to_owned_message();
    let limit = req.limit.clamp(1, 200);
    let (rows, total) = admin_db::list_audit_logs(
        pool,
        limit,
        req.offset,
        (!req.action.is_empty()).then_some(req.action.as_str()),
    )
    .await
    .map_err(|e| ConnectError::new(ErrorCode::Internal, e))?;
    Response::ok(ListAuditLogsResponse {
        entries: rows.iter().map(audit_from_json).collect(),
        total,
        ..Default::default()
    })
}

pub(super) async fn get_audit_log(
    admin: &AdminConnectService,
    ctx: RequestContext,
    request: ServiceRequest<'_, GetAuditLogRequest>,
) -> ServiceResult<GetAuditLogResponse> {
    require_admin(&ctx, &admin.state.auth).await?;
    let pool = admin.pool()?;
    let req = request.to_owned_message();
    let row = admin_db::get_audit_log(pool, req.id.trim())
        .await
        .map_err(|e| ConnectError::new(ErrorCode::Internal, e))?;
    Response::ok(GetAuditLogResponse {
        entry: audit_from_json(&row).into(),
        ..Default::default()
    })
}
