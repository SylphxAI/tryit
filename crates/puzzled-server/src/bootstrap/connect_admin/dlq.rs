use connectrpc::{
    ConnectError, ErrorCode, RequestContext, Response, ServiceRequest, ServiceResult,
};
use serde_json::Value;

use super::super::identity::require_admin;
use super::AdminConnectService;
use crate::capabilities::admin::adapters::admin_db;
use crate::proto::puzzled::v1::{
    DlqEntry, ListDlqRequest, ListDlqResponse, MarkDlqFailedRequest, MarkDlqFailedResponse,
    ResolveDlqRequest, ResolveDlqResponse, RetryDlqRequest, RetryDlqResponse,
};

fn dlq_from_json(v: &Value) -> DlqEntry {
    DlqEntry {
        id: v
            .get("id")
            .and_then(|x| x.as_str())
            .unwrap_or_default()
            .to_string(),
        job_type: v
            .get("jobType")
            .and_then(|x| x.as_str())
            .unwrap_or_default()
            .to_string(),
        payload_json: v
            .get("payloadJson")
            .and_then(|x| x.as_str())
            .unwrap_or_default()
            .to_string(),
        status: v
            .get("status")
            .and_then(|x| x.as_str())
            .unwrap_or_default()
            .to_string(),
        attempts: v.get("attempts").and_then(|x| x.as_u64()).unwrap_or(0) as u32,
        error: v
            .get("error")
            .and_then(|x| x.as_str())
            .unwrap_or_default()
            .to_string(),
        created_at: v
            .get("createdAt")
            .and_then(|x| x.as_str())
            .unwrap_or_default()
            .to_string(),
        next_retry_at: v
            .get("nextRetryAt")
            .and_then(|x| x.as_str())
            .unwrap_or_default()
            .to_string(),
        ..Default::default()
    }
}

pub(super) async fn list_dlq(
    admin: &AdminConnectService,
    ctx: RequestContext,
    request: ServiceRequest<'_, ListDlqRequest>,
) -> ServiceResult<ListDlqResponse> {
    require_admin(&ctx, &admin.state.auth).await?;
    let pool = admin.pool()?;
    let req = request.to_owned_message();
    let limit = req.limit.clamp(1, 200);
    let (rows, total, stats) = admin_db::list_dlq(pool, limit, req.offset)
        .await
        .map_err(|e| ConnectError::new(ErrorCode::Internal, e))?;
    Response::ok(ListDlqResponse {
        entries: rows.iter().map(dlq_from_json).collect(),
        total,
        pending: stats.get("pending").and_then(|v| v.as_u64()).unwrap_or(0) as u32,
        retrying: stats.get("retrying").and_then(|v| v.as_u64()).unwrap_or(0) as u32,
        resolved: stats.get("resolved").and_then(|v| v.as_u64()).unwrap_or(0) as u32,
        failed: stats.get("failed").and_then(|v| v.as_u64()).unwrap_or(0) as u32,
        by_workflow: stats
            .get("byWorkflow")
            .and_then(|v| v.as_object())
            .map(|m| {
                m.iter()
                    .map(|(k, v)| (k.clone(), v.as_u64().unwrap_or(0) as u32))
                    .collect()
            })
            .unwrap_or_default(),
        ..Default::default()
    })
}

pub(super) async fn retry_dlq(
    admin: &AdminConnectService,
    ctx: RequestContext,
    request: ServiceRequest<'_, RetryDlqRequest>,
) -> ServiceResult<RetryDlqResponse> {
    require_admin(&ctx, &admin.state.auth).await?;
    let pool = admin.pool()?;
    let req = request.to_owned_message();
    let ok = admin_db::dlq_retry(pool, req.id.trim())
        .await
        .map_err(|e| ConnectError::new(ErrorCode::Internal, e))?;
    Response::ok(RetryDlqResponse {
        ok,
        ..Default::default()
    })
}

pub(super) async fn resolve_dlq(
    admin: &AdminConnectService,
    ctx: RequestContext,
    request: ServiceRequest<'_, ResolveDlqRequest>,
) -> ServiceResult<ResolveDlqResponse> {
    require_admin(&ctx, &admin.state.auth).await?;
    let pool = admin.pool()?;
    let req = request.to_owned_message();
    let ok = admin_db::dlq_resolve(pool, req.id.trim())
        .await
        .map_err(|e| ConnectError::new(ErrorCode::Internal, e))?;
    Response::ok(ResolveDlqResponse {
        ok,
        ..Default::default()
    })
}

pub(super) async fn mark_dlq_failed(
    admin: &AdminConnectService,
    ctx: RequestContext,
    request: ServiceRequest<'_, MarkDlqFailedRequest>,
) -> ServiceResult<MarkDlqFailedResponse> {
    require_admin(&ctx, &admin.state.auth).await?;
    let pool = admin.pool()?;
    let req = request.to_owned_message();
    let ok = admin_db::dlq_mark_failed(pool, req.id.trim())
        .await
        .map_err(|e| ConnectError::new(ErrorCode::Internal, e))?;
    Response::ok(MarkDlqFailedResponse {
        ok,
        ..Default::default()
    })
}
