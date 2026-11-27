//! Closed-day alert policy. All inputs are aggregates; sparse baselines are
//! not failures and missing observations are never fabricated as zero rates.
use serde::{Deserialize, Serialize};

// Reports persisted before a field existed must still decode (as "not
// collected"), or the admin page and the rollup's history would fail closed.
#[derive(Clone, Debug, Default, Serialize, Deserialize)]
#[serde(default)]
pub struct Day {
    pub day_key: String,
    pub complete: bool,
    pub daily_puzzle_completers: i64,
    pub signed_in_completers: i64,
    pub daily_entertainment_completers: i64,
    pub weekly_ritualists: i64,
    pub d7_cohort: i64,
    pub d7_returned: i64,
    pub share_landings: i64,
    pub share_landing_completers: i64,
    pub shares: i64,
    pub free_finish_ok: i64,
    pub free_finish_failed: i64,
    pub paid_active: i64,
    pub paid_completers: i64,
    pub free_active: i64,
    pub free_completers: i64,
    pub catalog_size: i64,
    pub release: String,
    pub alerts: Vec<String>,
    /// Day-zero cohort: players whose first qualifying finish is on this day.
    /// Entry identity is the identity that recorded that first finish
    /// (guest credential or adopted guest row; signed-in account); the rest
    /// are unknown (pre-credential rows), never folded into either side.
    pub first_completers: i64,
    pub first_completers_guest_entry: i64,
    pub first_completers_signed_in_entry: i64,
    /// Guest-entry first completers whose player is signed in at rollup time.
    pub first_completers_guest_entry_now_signed_in: i64,
    /// D1: first completers of the previous day and those who finished again
    /// on this day. Final only once this day is `complete`.
    pub d1_cohort: i64,
    pub d1_returned: i64,
    pub d1_cohort_guest_entry: i64,
    pub d1_returned_guest_entry: i64,
}

pub fn alerts(
    day: &Day,
    previous: Option<&Day>,
    week_ago: Option<&Day>,
    explained: bool,
) -> Vec<String> {
    let mut alerts = Vec::new();
    let mut add = |name: &str, active: bool| {
        if active {
            alerts.push(name.to_owned());
        }
    };
    if let Some(p) = previous {
        add(
            "completers_drop",
            !explained
                && p.daily_puzzle_completers >= 20
                && day.daily_puzzle_completers * 100 < p.daily_puzzle_completers * 80,
        );
        add(
            "share_rate_collapse",
            p.shares >= 20
                && p.daily_puzzle_completers > 0
                && day.daily_puzzle_completers > 0
                && (day.shares as f64 / day.daily_puzzle_completers as f64)
                    < 0.5 * (p.shares as f64 / p.daily_puzzle_completers as f64),
        );
    }
    let attempts = day.free_finish_ok + day.free_finish_failed;
    add(
        "free_finish_errors",
        day.free_finish_failed >= 5 && day.free_finish_failed * 100 > attempts,
    );
    add(
        "paid_completion_gap",
        day.paid_active >= 20
            && day.free_active >= 20
            && (day.paid_completers as f64 / day.paid_active as f64)
                < 0.5 * (day.free_completers as f64 / day.free_active as f64),
    );
    add(
        "entertainment_drift",
        day.daily_entertainment_completers >= 20
            && day.daily_entertainment_completers > 3 * day.daily_puzzle_completers,
    );
    if let Some(p) = week_ago {
        add(
            "catalog_without_habit",
            p.catalog_size > 0
                && day.catalog_size > p.catalog_size
                && p.daily_puzzle_completers >= 20
                && day.daily_puzzle_completers <= p.daily_puzzle_completers,
        );
    }
    add(
        "shares_without_landings",
        day.shares >= 20 && day.share_landings == 0,
    );
    alerts
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn every_stop_the_line_signal_fires_and_explanations_only_suppress_the_drop() {
        let previous = Day {
            daily_puzzle_completers: 100,
            shares: 40,
            catalog_size: 19,
            ..Day::default()
        };
        let day = Day {
            daily_puzzle_completers: 70,
            shares: 0,
            free_finish_ok: 95,
            free_finish_failed: 5,
            paid_active: 20,
            paid_completers: 1,
            free_active: 20,
            free_completers: 10,
            daily_entertainment_completers: 220,
            catalog_size: 20,
            ..Day::default()
        };
        let a = alerts(&day, Some(&previous), Some(&previous), false);
        assert_eq!(a.len(), 6);
        assert!(a.contains(&"share_rate_collapse".into()));
        assert_eq!(
            alerts(&day, Some(&previous), Some(&previous), true).len(),
            5
        );
        let no_landing = Day {
            shares: 20,
            ..Day::default()
        };
        assert!(alerts(&no_landing, None, None, false).contains(&"shares_without_landings".into()));
    }
    #[test]
    fn sparse_baselines_and_boundary_values_do_not_page() {
        assert!(alerts(&Day::default(), None, None, false).is_empty());
        let p = Day {
            daily_puzzle_completers: 20,
            shares: 20,
            ..Day::default()
        };
        let day = Day {
            daily_puzzle_completers: 16,
            shares: 8,
            share_landings: 1,
            free_finish_ok: 495,
            free_finish_failed: 5,
            ..Day::default()
        };
        assert!(alerts(&day, Some(&p), None, false).is_empty());
    }

    #[test]
    fn a_report_persisted_before_the_cohort_fields_still_decodes() {
        let old = r#"{"day_key":"2026-11-01","complete":true,"daily_puzzle_completers":3,"signed_in_completers":1,"daily_entertainment_completers":0,"weekly_ritualists":0,"d7_cohort":2,"d7_returned":1,"share_landings":0,"share_landing_completers":0,"shares":0,"free_finish_ok":0,"free_finish_failed":0,"paid_active":0,"paid_completers":0,"free_active":0,"free_completers":0,"catalog_size":19,"release":"","alerts":[]}"#;
        let day: Day = serde_json::from_str(old).unwrap();
        assert_eq!((day.catalog_size, day.d7_cohort, day.d1_cohort), (19, 2, 0));
    }
}
