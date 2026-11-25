use connectrpc::{
    ConnectError, ErrorCode, RequestContext, Response, ServiceRequest, ServiceResult,
};
use serde_json::Value;

use super::super::identity::require_admin;
use super::AdminConnectService;
use crate::capabilities::admin::adapters::admin_db;
use crate::proto::puzzled::v1::{
    Announcement, CreateAnnouncementRequest, CreateAnnouncementResponse, DeleteAnnouncementRequest,
    DeleteAnnouncementResponse, ListAnnouncementsResponse, UpdateAnnouncementRequest,
    UpdateAnnouncementResponse,
};

pub(super) fn announcement_from_json(v: &Value) -> Announcement {
    Announcement {
        id: v
            .get("id")
            .and_then(|x| x.as_str())
            .unwrap_or_default()
            .to_string(),
        title: v
            .get("title")
            .and_then(|x| x.as_str())
            .unwrap_or_default()
            .to_string(),
        body: v
            .get("body")
            .and_then(|x| x.as_str())
            .unwrap_or_default()
            .to_string(),
        r#type: v
            .get("type")
            .and_then(|x| x.as_str())
            .unwrap_or("info")
            .to_string(),
        active: v.get("active").and_then(|x| x.as_bool()).unwrap_or(true),
        created_at: v
            .get("createdAt")
            .and_then(|x| x.as_str())
            .unwrap_or_default()
            .to_string(),
        updated_at: v
            .get("updatedAt")
            .and_then(|x| x.as_str())
            .unwrap_or_default()
            .to_string(),
        starts_at: v
            .get("startsAt")
            .and_then(|x| x.as_str())
            .unwrap_or_default()
            .to_string(),
        ends_at: v
            .get("endsAt")
            .and_then(|x| x.as_str())
            .unwrap_or_default()
            .to_string(),
        dismissible: v
            .get("dismissible")
            .and_then(|x| x.as_bool())
            .unwrap_or(true),
        ..Default::default()
    }
}

pub(super) async fn list_announcements(
    admin: &AdminConnectService,
    ctx: RequestContext,
) -> ServiceResult<ListAnnouncementsResponse> {
    require_admin(&ctx, &admin.state.auth).await?;
    let pool = admin.pool()?;
    let rows = admin_db::list_announcements(pool)
        .await
        .map_err(|e| ConnectError::new(ErrorCode::Internal, e))?;
    Response::ok(ListAnnouncementsResponse {
        announcements: rows.iter().map(announcement_from_json).collect(),
        ..Default::default()
    })
}

pub(super) async fn create_announcement(
    admin: &AdminConnectService,
    ctx: RequestContext,
    request: ServiceRequest<'_, CreateAnnouncementRequest>,
) -> ServiceResult<CreateAnnouncementResponse> {
    let identity = require_admin(&ctx, &admin.state.auth).await?;
    let pool = admin.pool()?;
    let req = request.to_owned_message();
    if req.title.trim().is_empty() || req.body.trim().is_empty() {
        return Err(ConnectError::new(
            ErrorCode::InvalidArgument,
            "title_and_body_required",
        ));
    }
    let starts_at = admin_db::parse_announcement_bound(&req.starts_at)
        .map_err(|e| ConnectError::new(ErrorCode::InvalidArgument, e))?;
    let ends_at = admin_db::parse_announcement_bound(&req.ends_at)
        .map_err(|e| ConnectError::new(ErrorCode::InvalidArgument, e))?;
    admin_db::validate_announcement_window(starts_at, ends_at)
        .map_err(|e| ConnectError::new(ErrorCode::InvalidArgument, e))?;
    let row = admin_db::create_announcement(
        pool,
        req.title.trim(),
        req.body.trim(),
        if req.r#type.trim().is_empty() {
            "info"
        } else {
            req.r#type.trim()
        },
        req.active,
        req.dismissible.unwrap_or(true),
        starts_at,
        ends_at,
        &identity.user_id,
    )
    .await
    .map_err(|e| ConnectError::new(ErrorCode::Internal, e))?;
    Response::ok(CreateAnnouncementResponse {
        announcement: announcement_from_json(&row).into(),
        ..Default::default()
    })
}

pub(super) async fn update_announcement(
    admin: &AdminConnectService,
    ctx: RequestContext,
    request: ServiceRequest<'_, UpdateAnnouncementRequest>,
) -> ServiceResult<UpdateAnnouncementResponse> {
    require_admin(&ctx, &admin.state.auth).await?;
    let pool = admin.pool()?;
    let req = request.to_owned_message();
    let bound = |v: &Option<String>| match v {
        None => Ok(None),
        Some(v) => admin_db::parse_announcement_bound(v).map(Some),
    };
    let starts_at =
        bound(&req.starts_at).map_err(|e| ConnectError::new(ErrorCode::InvalidArgument, e))?;
    let ends_at =
        bound(&req.ends_at).map_err(|e| ConnectError::new(ErrorCode::InvalidArgument, e))?;
    let row = admin_db::update_announcement(
        pool,
        req.id.trim(),
        req.title.as_deref(),
        req.body.as_deref(),
        req.r#type.as_deref(),
        req.active,
        req.dismissible,
        starts_at,
        ends_at,
    )
    .await
    .map_err(|e| {
        let code = if e == "ends_before_start" {
            ErrorCode::InvalidArgument
        } else {
            ErrorCode::Internal
        };
        ConnectError::new(code, e)
    })?;
    Response::ok(UpdateAnnouncementResponse {
        announcement: announcement_from_json(&row).into(),
        ..Default::default()
    })
}

pub(super) async fn delete_announcement(
    admin: &AdminConnectService,
    ctx: RequestContext,
    request: ServiceRequest<'_, DeleteAnnouncementRequest>,
) -> ServiceResult<DeleteAnnouncementResponse> {
    require_admin(&ctx, &admin.state.auth).await?;
    let pool = admin.pool()?;
    let req = request.to_owned_message();
    let deleted = admin_db::delete_announcement(pool, req.id.trim())
        .await
        .map_err(|e| ConnectError::new(ErrorCode::Internal, e))?;
    Response::ok(DeleteAnnouncementResponse {
        deleted,
        ..Default::default()
    })
}
