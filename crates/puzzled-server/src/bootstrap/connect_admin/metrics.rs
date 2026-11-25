use connectrpc::{ConnectError, ErrorCode, RequestContext, Response, ServiceResult};

use super::super::identity::require_admin;
use super::AdminConnectService;
use crate::proto::puzzled::v1::{GetMetricsReportResponse, MetricDay};

pub(super) async fn get_metrics_report(
    admin: &AdminConnectService,
    ctx: RequestContext,
) -> ServiceResult<GetMetricsReportResponse> {
    require_admin(&ctx, &admin.state.auth).await?;
    let rows = crate::capabilities::metrics::reports(admin.pool()?)
        .await
        .map_err(|_| ConnectError::new(ErrorCode::Unavailable, "metrics_unavailable"))?;
    let stale = rows
        .first()
        .and_then(|(_, t)| chrono::DateTime::parse_from_rfc3339(t).ok())
        .is_none_or(|t| chrono::Utc::now().signed_duration_since(t).num_minutes() > 30);
    let n = |v: i64| u32::try_from(v).unwrap_or(u32::MAX);
    let days = rows
        .into_iter()
        .map(|(d, generated_at)| MetricDay {
            day_key: d.day_key,
            complete: d.complete,
            daily_puzzle_completers: n(d.daily_puzzle_completers),
            signed_in_completers: n(d.signed_in_completers),
            daily_entertainment_completers: n(d.daily_entertainment_completers),
            weekly_ritualists: n(d.weekly_ritualists),
            d7_cohort: n(d.d7_cohort),
            d7_returned: n(d.d7_returned),
            share_landings: n(d.share_landings),
            share_landing_completers: n(d.share_landing_completers),
            shares: n(d.shares),
            free_finish_ok: n(d.free_finish_ok),
            free_finish_failed: n(d.free_finish_failed),
            paid_active: n(d.paid_active),
            paid_completers: n(d.paid_completers),
            free_active: n(d.free_active),
            free_completers: n(d.free_completers),
            catalog_size: n(d.catalog_size),
            release: d.release,
            alerts: d.alerts,
            generated_at,
            ..Default::default()
        })
        .collect();
    Response::ok(GetMetricsReportResponse {
        days,
        stale,
        ..Default::default()
    })
}
