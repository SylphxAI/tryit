use std::collections::BTreeMap;

use chrono::NaiveDate;

use super::super::game_slugs::ModuleClass;

/// Compact row shape for daily puzzle completers / weekly ritualists recompute.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct RitualCompletionRow {
    pub user_id: String,
    pub day_key: String,
    pub module_class: ModuleClass,
    pub is_ritual: bool,
}

/// Trailing window length (product days) for weekly ritualists (`compute_hrc`).
pub const HABITUAL_WINDOW_DAYS: i64 = 7;

/// Minimum distinct daily-puzzle-completer days inside [`HABITUAL_WINDOW_DAYS`].
pub const HABITUAL_MIN_DAYS: u32 = 4;

/// Public English field for the supporting habit oracle (not the executive NSM).
pub const WEEKLY_RITUALISTS_FIELD: &str = "weekly_ritualists";

/// Recompute `daily_puzzle_completers(D)` = distinct users with ≥1 qualifying ritual finish on day `D`.
#[must_use]
pub fn compute_drc(day_key: &str, rows: &[RitualCompletionRow]) -> u64 {
    let mut users: Vec<&str> = rows
        .iter()
        .filter(|r| {
            r.is_ritual
                && r.day_key == day_key
                && matches!(r.module_class, ModuleClass::PuzzleRitual)
        })
        .map(|r| r.user_id.as_str())
        .collect();
    users.sort_unstable();
    users.dedup();
    users.len() as u64
}

/// SQL recipe (documentation + live ops) for Postgres daily puzzle completers recompute.
///
/// Bound `$1` = day_key `YYYY-MM-DD`. Public metric field: `daily_puzzle_completers`.
pub const DRC_RECOMPUTE_SQL: &str = concat!(
    include_str!("implausible_finish_players.sql"),
    r#"
SELECT COUNT(DISTINCT user_id)::bigint AS daily_puzzle_completers
FROM game_sessions
WHERE day_key = $1
  AND is_ritual = true
  AND module_class = 'puzzle_ritual'
  AND status IN ('won', 'lost')
  AND NOT comparison_excluded
  AND NOT EXISTS (SELECT 1 FROM synthetic_fixtures f WHERE f.user_id = game_sessions.user_id)
  AND NOT EXISTS (SELECT 1 FROM implausible_finish_players f WHERE f.user_id = game_sessions.user_id)
"#
);

/// One-snapshot overview: distinct completers and per-module ritual finish counts.
///
/// Bound `$1` = day_key `YYYY-MM-DD`. This is a play-surface snapshot, not
/// the operator metric in [`DRC_RECOMPUTE_SQL`].
/// The grand-total grouping has a NULL slug, including on an empty day. Game
/// slugs are non-null in storage. One grouping-set scan avoids a second query,
/// pool acquisition, and potentially different READ COMMITTED snapshot.
pub const TODAY_OVERVIEW_SQL: &str = r#"
SELECT game_slug,
       CASE WHEN GROUPING(game_slug) = 1 THEN COUNT(DISTINCT user_id)
            ELSE COUNT(*) END::bigint AS count
FROM game_sessions
WHERE day_key = $1
  AND is_ritual = true
  AND module_class = 'puzzle_ritual'
  AND status IN ('won', 'lost')
GROUP BY GROUPING SETS ((), (game_slug))
ORDER BY game_slug NULLS FIRST
"#;

/// Compact row shape for the product-day overview read model.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct RitualOverviewRow {
    pub user_id: String,
    pub day_key: String,
    pub game_module_id: String,
    pub module_class: ModuleClass,
    pub is_ritual: bool,
}

impl RitualOverviewRow {
    #[must_use]
    pub fn completion_row(&self) -> RitualCompletionRow {
        RitualCompletionRow {
            user_id: self.user_id.clone(),
            day_key: self.day_key.clone(),
            module_class: self.module_class,
            is_ritual: self.is_ritual,
        }
    }
}

/// Product read model for today's ritual: daily puzzle completers plus
/// per-module qualifying finish counts on the same product day.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct TodayOverview {
    pub player_count: u64,
    pub completions: Vec<(String, u64)>,
}

/// Recompute `GetTodayOverview` from canonical qualifying ritual rows.
///
/// `player_count` is [`compute_drc`] for `day_key`. Archive, practice,
/// entertainment, dry-run, and non-ritual won-lost rows do not count.
#[must_use]
pub fn compute_today_overview(day_key: &str, rows: &[RitualOverviewRow]) -> TodayOverview {
    let completion_rows: Vec<RitualCompletionRow> =
        rows.iter().map(RitualOverviewRow::completion_row).collect();
    let player_count = compute_drc(day_key, &completion_rows);
    let mut counts: BTreeMap<String, u64> = BTreeMap::new();
    for row in rows {
        if row.is_ritual
            && row.day_key == day_key
            && matches!(row.module_class, ModuleClass::PuzzleRitual)
        {
            *counts.entry(row.game_module_id.clone()).or_insert(0) += 1;
        }
    }
    TodayOverview {
        player_count,
        completions: counts.into_iter().collect(),
    }
}

/// Recompute weekly ritualists ending on `end_day_key`.
///
/// Distinct users with ≥ [`HABITUAL_MIN_DAYS`] distinct daily-puzzle-completer
/// days in the trailing [`HABITUAL_WINDOW_DAYS`] ending on `end_day_key`.
/// Invalid `end_day_key` yields `0` (uncomputable is not a fake habit win).
///
/// Domain helper name [`compute_hrc`] is the supporting oracle identity.
/// Public English field: [`WEEKLY_RITUALISTS_FIELD`]. Do not invent DPC.
#[must_use]
pub fn compute_hrc(end_day_key: &str, rows: &[RitualCompletionRow]) -> u64 {
    let Ok(end) = NaiveDate::parse_from_str(end_day_key, "%Y-%m-%d") else {
        return 0;
    };
    let start = end - chrono::Duration::days(HABITUAL_WINDOW_DAYS - 1);
    let mut pairs: Vec<(&str, &str)> = rows
        .iter()
        .filter(|r| r.is_ritual && matches!(r.module_class, ModuleClass::PuzzleRitual))
        .filter(|r| {
            NaiveDate::parse_from_str(&r.day_key, "%Y-%m-%d")
                .ok()
                .is_some_and(|d| d >= start && d <= end)
        })
        .map(|r| (r.user_id.as_str(), r.day_key.as_str()))
        .collect();
    pairs.sort_unstable();
    pairs.dedup();
    let mut weekly_ritualists = 0_u64;
    let mut i = 0;
    while i < pairs.len() {
        let user = pairs[i].0;
        let mut j = i;
        while j < pairs.len() && pairs[j].0 == user {
            j += 1;
        }
        if (j - i) as u32 >= HABITUAL_MIN_DAYS {
            weekly_ritualists += 1;
        }
        i = j;
    }
    weekly_ritualists
}

/// English public alias of [`compute_hrc`].
#[must_use]
pub fn compute_weekly_ritualists(end_day_key: &str, rows: &[RitualCompletionRow]) -> u64 {
    compute_hrc(end_day_key, rows)
}

/// SQL recipe (documentation + live ops) for Postgres weekly ritualists recompute.
///
/// Bound `$1` = end day_key `YYYY-MM-DD`. Window is `$1-6` … `$1` inclusive;
/// threshold is [`HABITUAL_MIN_DAYS`] distinct daily-puzzle-completer days.
/// Public metric field: `weekly_ritualists`.
pub const HRC_RECOMPUTE_SQL: &str = concat!(
    include_str!("implausible_finish_players.sql"),
    r#"
, daily AS (
  SELECT user_id, day_key
  FROM game_sessions
  WHERE is_ritual = true
    AND module_class = 'puzzle_ritual'
    AND status IN ('won', 'lost')
    AND NOT comparison_excluded
    AND NOT EXISTS (SELECT 1 FROM synthetic_fixtures f WHERE f.user_id = game_sessions.user_id)
    AND NOT EXISTS (SELECT 1 FROM implausible_finish_players f WHERE f.user_id = game_sessions.user_id)
    AND day_key >= to_char(($1::date - 6), 'YYYY-MM-DD')
    AND day_key <= $1
  GROUP BY user_id, day_key
)
SELECT COUNT(*)::bigint AS weekly_ritualists
FROM (
  SELECT user_id
  FROM daily
  GROUP BY user_id
  HAVING COUNT(*) >= 4
) t
"#
);
