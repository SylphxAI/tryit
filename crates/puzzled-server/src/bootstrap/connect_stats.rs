//! Native Connect StatsService — technology-stack-profile (buffa + connectrpc).

use std::sync::Arc;

use chrono::Utc;
use connectrpc::{
    ConnectError, ErrorCode, RequestContext, Response, ServiceRequest, ServiceResult,
};

use super::state::AppState;
use crate::capabilities::stats::adapters::sessions_stats_db::{
    today_overview, today_percentile, user_history_on_connection, user_stats_on_connection,
};
use crate::proto::puzzled::v1::{
    GetHistoryRequest, GetHistoryResponse, GetLeaderboardRequest, GetLeaderboardResponse,
    GetTodayOverviewRequest, GetTodayOverviewResponse, GetTodayPercentileRequest,
    GetTodayPercentileResponse, GetUserStatsRequest, GetUserStatsResponse, SessionEntry,
    StatsService, UserGameStats,
};
use puzzled_core::puzzle_play::daily_time::product_day_key_string;
use puzzled_core::puzzle_play::game_slugs::is_valid_game_slug;

#[derive(Clone)]
pub struct StatsConnectService {
    state: AppState,
}

impl StatsConnectService {
    pub fn new(state: AppState) -> Self {
        Self { state }
    }

    async fn adopt_guest_progress_if_needed(
        &self,
        ctx: &RequestContext,
    ) -> Result<crate::bootstrap::identity::RequestAccess, ConnectError> {
        crate::bootstrap::identity::admitted_request_identities(
            ctx,
            self.state.pool.as_ref(),
            false,
        )
        .await
    }
}

#[allow(refining_impl_trait_internal, refining_impl_trait_reachable)]
impl StatsService for StatsConnectService {
    // Keep the RPC in the descriptor for existing clients, without reading player data.
    async fn get_leaderboard(
        &self,
        _ctx: RequestContext,
        _request: ServiceRequest<'_, GetLeaderboardRequest>,
    ) -> ServiceResult<GetLeaderboardResponse> {
        Err(ConnectError::new(
            ErrorCode::Unimplemented,
            "leaderboard_retired",
        ))
    }

    async fn get_today_percentile(
        &self,
        ctx: RequestContext,
        request: ServiceRequest<'_, GetTodayPercentileRequest>,
    ) -> ServiceResult<GetTodayPercentileResponse> {
        let req = request.to_owned_message();
        let slug = req.game_slug.trim();
        let day_key = product_day_key_string(Utc::now());
        let mut result = GetTodayPercentileResponse {
            game_slug: slug.into(),
            day_key: day_key.clone(),
            ..Default::default()
        };
        if slug.is_empty() || !is_valid_game_slug(slug) {
            result.dispatch = "invalid_or_empty".into();
        } else if !req.day_key.is_empty() && req.day_key != day_key {
            result.dispatch = "different_day".into();
        } else if self.state.pool.is_none() {
            result.stub = true;
            result.dispatch = "unavailable_data".into();
        } else {
            // This uses the same admitted cookie/account and adoption transaction
            // as accepted play. Supplied scores, status, and fixture counts are
            // legacy wire fields only and can never establish a finish.
            let mut access = self.adopt_guest_progress_if_needed(&ctx).await?;
            let uid = access.primary().map(|identity| identity.user_id.clone());
            let read = match access.connection() {
                Some(connection) => {
                    today_percentile(connection, &day_key, slug, uid.as_deref()).await
                }
                None => {
                    let pool = self.state.pool.as_ref().ok_or_else(|| {
                        ConnectError::new(ErrorCode::Internal, "stats_pool_missing")
                    })?;
                    let mut connection = pool.acquire().await.map_err(|_| {
                        ConnectError::new(ErrorCode::Unavailable, "stats_unavailable")
                    })?;
                    today_percentile(&mut connection, &day_key, slug, None).await
                }
            };
            match read {
                Ok(read) => {
                    result.percentile = read.percentile;
                    result.total_players = read.total;
                    result.stub = read.dispatch == "unavailable_data";
                    result.dispatch = read.dispatch.into();
                }
                Err(error) => {
                    tracing::warn!(%error, game_slug = slug, "today percentile read failed");
                    result.stub = true;
                    result.dispatch = "unavailable_data".into();
                }
            }
            access.commit().await?;
        }
        Ok(Response::new(result)
            .with_header("cache-control", "private, no-store, max-age=0")
            .with_header("cdn-cache-control", "no-store"))
    }
    async fn get_today_overview(
        &self,
        _ctx: RequestContext,
        _request: ServiceRequest<'_, GetTodayOverviewRequest>,
    ) -> ServiceResult<GetTodayOverviewResponse> {
        let day_key = product_day_key_string(Utc::now());
        let overview = match &self.state.pool {
            Some(pool) => today_overview(pool, &day_key).await.map_err(|e| {
                tracing::warn!(%e, "today overview failed");
                ConnectError::new(ErrorCode::Internal, "today_overview_failed")
            })?,
            None => puzzled_core::puzzle_play::ritual_completion::TodayOverview {
                player_count: 0,
                completions: Vec::new(),
            },
        };
        let completions_proto = overview
            .completions
            .into_iter()
            .map(
                |(slug, count)| crate::proto::puzzled::v1::GameCompletionCount {
                    game_slug: slug,
                    count: count as u32,
                    ..Default::default()
                },
            )
            .collect();
        Response::ok(GetTodayOverviewResponse {
            player_count: overview.player_count as u32,
            completions: completions_proto,
            ..Default::default()
        })
    }

    async fn get_user_stats(
        &self,
        ctx: RequestContext,
        request: ServiceRequest<'_, GetUserStatsRequest>,
    ) -> ServiceResult<GetUserStatsResponse> {
        let mut access = self.adopt_guest_progress_if_needed(&ctx).await?;
        let identity = access.primary().cloned().ok_or_else(|| {
            ConnectError::new(ErrorCode::Unauthenticated, "identity_required_for_submit")
        })?;
        let req = request.to_owned_message();
        let (games, total_played, total_won) = match access.connection() {
            Some(connection) => user_stats_on_connection(connection, &identity.user_id)
                .await
                .map_err(|e| {
                    tracing::warn!(%e, "user stats read failed");
                    ConnectError::new(ErrorCode::Internal, "user_stats_read_failed")
                })?,
            None => (Vec::new(), 0, 0),
        };
        let games_proto: Vec<UserGameStats> = games
            .iter()
            .map(|g| UserGameStats {
                game_slug: g
                    .get("gameSlug")
                    .and_then(|v| v.as_str())
                    .unwrap_or_default()
                    .to_string(),
                games_played: g.get("gamesPlayed").and_then(|v| v.as_u64()).unwrap_or(0) as u32,
                games_won: g.get("gamesWon").and_then(|v| v.as_u64()).unwrap_or(0) as u32,
                best_score: g.get("bestScore").and_then(|v| v.as_u64()).unwrap_or(0) as u32,
                ..Default::default()
            })
            .collect();
        let _ = req;
        access.commit().await?;
        Response::ok(GetUserStatsResponse {
            games: games_proto,
            total_played,
            total_won,
            ..Default::default()
        })
    }

    async fn get_history(
        &self,
        ctx: RequestContext,
        request: ServiceRequest<'_, GetHistoryRequest>,
    ) -> ServiceResult<GetHistoryResponse> {
        let mut access = self.adopt_guest_progress_if_needed(&ctx).await?;
        let identity = access.primary().cloned().ok_or_else(|| {
            ConnectError::new(ErrorCode::Unauthenticated, "identity_required_for_submit")
        })?;
        let req = request.to_owned_message();
        let slug = (!req.game_slug.trim().is_empty()).then(|| req.game_slug.trim().to_string());
        let rows = match access.connection() {
            Some(connection) => user_history_on_connection(
                connection,
                &identity.user_id,
                slug.as_deref(),
                req.limit,
            )
            .await
            .map_err(|e| {
                tracing::warn!(%e, "history read failed");
                ConnectError::new(ErrorCode::Internal, "history_read_failed")
            })?,
            None => Vec::new(),
        };
        let sessions: Vec<SessionEntry> = rows
            .iter()
            .map(|r| SessionEntry {
                game_slug: r
                    .get("gameSlug")
                    .and_then(|v| v.as_str())
                    .unwrap_or_default()
                    .to_string(),
                puzzle_id: r
                    .get("puzzleId")
                    .and_then(|v| v.as_str())
                    .unwrap_or_default()
                    .to_string(),
                puzzle_date: r
                    .get("puzzleDate")
                    .and_then(|v| v.as_str())
                    .unwrap_or_default()
                    .to_string(),
                status: r
                    .get("status")
                    .and_then(|v| v.as_str())
                    .unwrap_or_default()
                    .to_string(),
                score: r.get("score").and_then(|v| v.as_u64()).unwrap_or(0) as u32,
                attempts: r.get("attempts").and_then(|v| v.as_u64()).unwrap_or(0) as u32,
                time_spent_ms: r.get("timeSpentMs").and_then(|v| v.as_u64()).unwrap_or(0),
                mode: r
                    .get("mode")
                    .and_then(|v| v.as_str())
                    .unwrap_or_default()
                    .to_string(),
                ..Default::default()
            })
            .collect();
        access.commit().await?;
        Response::ok(GetHistoryResponse {
            sessions,
            ..Default::default()
        })
    }
}

pub fn stats_connect_service(state: AppState) -> Arc<StatsConnectService> {
    Arc::new(StatsConnectService::new(state))
}
