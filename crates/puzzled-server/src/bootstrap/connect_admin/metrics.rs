use connectrpc::{ConnectError, ErrorCode, RequestContext, Response, ServiceResult};

use super::super::identity::require_admin;
use super::AdminConnectService;
use crate::capabilities::metrics::policy::{Cohorts, Day};
use crate::proto::puzzled::v1::{
    FirstFinishCohorts, GetMetricsReportResponse, GuestStartCohort, MetricDay,
};

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
    Response::ok(GetMetricsReportResponse {
        days: rows
            .into_iter()
            .map(|(day, at)| metric_day(day, at))
            .collect(),
        stale,
        ..Default::default()
    })
}

fn metric_day(d: Day, generated_at: String) -> MetricDay {
    let n = |v: i64| u32::try_from(v).unwrap_or(u32::MAX);
    MetricDay {
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
        cohorts: cohorts(d.cohorts).into(),
        guest_start_cohort: d
            .guest_start_cohort
            .map(|c| GuestStartCohort {
                started: n(c.started),
                completed_same_day: n(c.completed_same_day),
                ..Default::default()
            })
            .into(),
        ..Default::default()
    }
}

/// Absent stays absent (stored before collection): never a zero cohort.
fn cohorts(c: Option<Cohorts>) -> Option<FirstFinishCohorts> {
    let n = |v: i64| u32::try_from(v).unwrap_or(u32::MAX);
    c.map(|c| FirstFinishCohorts {
        first_completers: n(c.first_completers),
        first_guest_entry: n(c.first_guest_entry),
        first_signed_in_entry: n(c.first_signed_in_entry),
        first_guest_entry_now_signed_in: n(c.first_guest_entry_now_signed_in),
        d1_cohort: n(c.d1_cohort),
        d1_returned: n(c.d1_returned),
        d1_cohort_guest_entry: n(c.d1_cohort_guest_entry),
        d1_returned_guest_entry: n(c.d1_returned_guest_entry),
        ..Default::default()
    })
}

#[cfg(test)]
#[allow(clippy::unwrap_used)]
mod tests {
    use super::*;
    use crate::capabilities::metrics::policy::GuestStartCohort as GuestStartCounts;
    use buffa::Message;

    #[test]
    fn stored_reports_keep_not_collected_empty_and_provisional_distinct() {
        let legacy: Day = serde_json::from_str(r#"{"day_key":"2026-11-01","complete":true,"daily_puzzle_completers":3,"signed_in_completers":1,"daily_entertainment_completers":0,"weekly_ritualists":0,"d7_cohort":2,"d7_returned":1,"share_landings":0,"share_landing_completers":0,"shares":0,"free_finish_ok":0,"free_finish_failed":0,"paid_active":0,"paid_completers":0,"free_active":0,"free_completers":0,"catalog_size":19,"release":"","alerts":[]}"#).unwrap();
        assert!(legacy.complete && (legacy.d7_cohort, legacy.catalog_size) == (2, 19));
        let wire = metric_day(legacy, String::new());
        assert!(wire.cohorts.is_unset());
        assert!(MetricDay::decode_from_slice(&wire.encode_to_vec())
            .unwrap()
            .guest_start_cohort
            .is_unset());
        assert!(serde_json::to_value(wire)
            .unwrap()
            .get("guestStartCohort")
            .is_none());
        for complete in [true, false] {
            let day = Day {
                complete,
                cohorts: Some(Cohorts::default()),
                guest_start_cohort: Some(GuestStartCounts::default()),
                ..Day::default()
            };
            let stored: Day = serde_json::from_str(&serde_json::to_string(&day).unwrap()).unwrap();
            let wire = metric_day(stored, String::new());
            let wire = MetricDay::decode_from_slice(&wire.encode_to_vec()).unwrap();
            let guest = wire.guest_start_cohort.as_option().unwrap();
            assert_eq!((guest.started, guest.completed_same_day), (0, 0));
            assert_eq!(
                serde_json::to_value(&wire).unwrap()["guestStartCohort"],
                serde_json::json!({})
            );
            assert_eq!(
                (wire.complete, wire.cohorts.as_option().map(|c| c.d1_cohort)),
                (complete, Some(0))
            );
        }
    }
}
