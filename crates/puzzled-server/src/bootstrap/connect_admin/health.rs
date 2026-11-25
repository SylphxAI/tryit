use connectrpc::{RequestContext, Response, ServiceResult};

use super::super::identity::require_admin;
use super::AdminConnectService;
use crate::proto::puzzled::v1::SystemHealthResponse;

pub(super) async fn system_health(
    admin: &AdminConnectService,
    ctx: RequestContext,
) -> ServiceResult<SystemHealthResponse> {
    require_admin(&ctx, &admin.state.auth).await?;
    let (database_ok, database_error) = match &admin.state.pool {
        Some(pool) => match sqlx::query("SELECT 1").fetch_one(pool).await {
            Ok(_) => (true, String::new()),
            Err(error) => (false, error.to_string()),
        },
        None => (false, "no database pool".to_string()),
    };
    Response::ok(SystemHealthResponse {
        database_ok,
        database_error,
        uptime: format!("{}s", admin.state.uptime_secs()),
        ..Default::default()
    })
}
