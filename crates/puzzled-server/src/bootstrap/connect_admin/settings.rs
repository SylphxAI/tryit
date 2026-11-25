use connectrpc::{
    ConnectError, ErrorCode, RequestContext, Response, ServiceRequest, ServiceResult,
};
use serde_json::Value;

use super::super::identity::require_admin;
use super::AdminConnectService;
use crate::capabilities::admin::adapters::admin_db;
use crate::proto::puzzled::v1::{
    AppSettings, GetSettingsResponse, UpdateSettingsRequest, UpdateSettingsResponse,
};

pub(super) async fn get_settings(
    admin: &AdminConnectService,
    ctx: RequestContext,
) -> ServiceResult<GetSettingsResponse> {
    require_admin(&ctx, &admin.state.auth).await?;
    let pool = admin.pool()?;
    let rows = admin_db::list_settings(pool)
        .await
        .map_err(|e| ConnectError::new(ErrorCode::Internal, e))?;
    let settings = rows
        .iter()
        .map(|v| AppSettings {
            key: v
                .get("key")
                .and_then(|x| x.as_str())
                .unwrap_or_default()
                .to_string(),
            value_json: v.get("value").map(|x| x.to_string()).unwrap_or_default(),
            ..Default::default()
        })
        .collect();
    Response::ok(GetSettingsResponse {
        settings,
        ..Default::default()
    })
}

pub(super) async fn update_settings(
    admin: &AdminConnectService,
    ctx: RequestContext,
    request: ServiceRequest<'_, UpdateSettingsRequest>,
) -> ServiceResult<UpdateSettingsResponse> {
    let identity = require_admin(&ctx, &admin.state.auth).await?;
    let pool = admin.pool()?;
    let req = request.to_owned_message();
    let value: Value = serde_json::from_str(&req.value_json)
        .map_err(|_| ConnectError::new(ErrorCode::InvalidArgument, "invalid_value_json"))?;
    let row = admin_db::upsert_setting(pool, req.key.trim(), &value, &identity.user_id)
        .await
        .map_err(|e| ConnectError::new(ErrorCode::Internal, e))?;
    Response::ok(UpdateSettingsResponse {
        setting: Some(AppSettings {
            key: row
                .get("key")
                .and_then(|x| x.as_str())
                .unwrap_or_default()
                .to_string(),
            value_json: row.get("value").map(|x| x.to_string()).unwrap_or_default(),
            ..Default::default()
        })
        .into(),
        ..Default::default()
    })
}
