use connectrpc::{
    ConnectError, ErrorCode, RequestContext, Response, ServiceRequest, ServiceResult,
};

use super::super::identity::require_admin;
use super::AdminConnectService;
use crate::capabilities::admin::adapters::admin_db;
use crate::proto::puzzled::v1::{
    DailyStat, GamesOverviewResponse, GetGameAnalyticsRequest, GetGameAnalyticsResponse,
};

pub(super) async fn games_overview(
    admin: &AdminConnectService,
    ctx: RequestContext,
) -> ServiceResult<GamesOverviewResponse> {
    require_admin(&ctx, &admin.state.auth).await?;
    let pool = admin.pool()?;
    let rows = admin_db::games_overview(pool)
        .await
        .map_err(|e| ConnectError::new(ErrorCode::Internal, e))?;
    let games = rows
        .iter()
        .map(|v| crate::proto::puzzled::v1::GamesOverviewEntry {
            slug: v
                .get("slug")
                .and_then(|x| x.as_str())
                .unwrap_or_default()
                .to_string(),
            name: v
                .get("slug")
                .and_then(|x| x.as_str())
                .unwrap_or_default()
                .to_string(),
            today_played: v.get("todayPlayed").and_then(|x| x.as_u64()).unwrap_or(0) as u32,
            today_wins: v.get("todayWins").and_then(|x| x.as_u64()).unwrap_or(0) as u32,
            all_time_played: v.get("allTimePlayed").and_then(|x| x.as_u64()).unwrap_or(0) as u32,
            all_time_wins: v.get("allTimeWins").and_then(|x| x.as_u64()).unwrap_or(0) as u32,
            ..Default::default()
        })
        .collect();
    Response::ok(GamesOverviewResponse {
        games,
        ..Default::default()
    })
}

pub(super) async fn get_game_analytics(
    admin: &AdminConnectService,
    ctx: RequestContext,
    request: ServiceRequest<'_, GetGameAnalyticsRequest>,
) -> ServiceResult<GetGameAnalyticsResponse> {
    require_admin(&ctx, &admin.state.auth).await?;
    let pool = admin.pool()?;
    let req = request.to_owned_message();
    let rows = admin_db::game_analytics(pool, req.game_slug.trim(), req.days)
        .await
        .map_err(|e| ConnectError::new(ErrorCode::Internal, e))?;
    let daily_stats: Vec<DailyStat> = rows
        .iter()
        .map(|v| DailyStat {
            date: v
                .get("date")
                .and_then(|x| x.as_str())
                .unwrap_or_default()
                .to_string(),
            games_played: v.get("gamesPlayed").and_then(|x| x.as_u64()).unwrap_or(0) as u32,
            wins: v.get("wins").and_then(|x| x.as_u64()).unwrap_or(0) as u32,
            avg_attempts: v.get("avgAttempts").and_then(|x| x.as_f64()).unwrap_or(0.0),
            ..Default::default()
        })
        .collect();
    Response::ok(GetGameAnalyticsResponse {
        daily_stats,
        ..Default::default()
    })
}
