//! Ritual completion contract and recompute oracles (North Star S0).
//!
//! A qualifying finish is produced only after **server-side** play validation
//! (ADR-170). Clients never assert completion. This module is pure: the shell
//! persists the record and recomputes **daily puzzle completers** plus the
//! supporting habit oracle **weekly ritualists** (`compute_hrc`, 4-of-7).
//! Do not mint a house score acronym (including DPC) for either quantity.

mod event;
mod finish_guard;
mod metrics;

pub use event::{
    build_ritual_completed, qualifies_as_ritual, FinishKind, RitualCompleted, RitualQualifyInput,
};
pub use finish_guard::{ritual_already_finished, submit_must_guard_already_played};
pub use metrics::{
    compute_drc, compute_hrc, compute_today_overview, compute_weekly_ritualists,
    RitualCompletionRow, RitualOverviewRow, TodayOverview, DRC_RECOMPUTE_SQL, HABITUAL_MIN_DAYS,
    HABITUAL_WINDOW_DAYS, HRC_RECOMPUTE_SQL, TODAY_OVERVIEW_SQL, WEEKLY_RITUALISTS_FIELD,
};

#[cfg(test)]
mod tests;
