use chrono::NaiveDate;

use super::super::game_slugs::ModuleClass::{self, EntertainmentOracle, PuzzleRitual};
use super::*;

#[test]
fn daily_won_puzzle_ritual_qualifies() {
    assert!(qualifies_as_ritual(RitualQualifyInput {
        game_module_id: "sudoku",
        mode: "daily",
        status: "won",
        is_dry_run: false,
    }));
    assert!(qualifies_as_ritual(RitualQualifyInput {
        game_module_id: "word-guess",
        mode: "daily",
        status: "lost",
        is_dry_run: false,
    }));
}

#[test]
fn archive_practice_dry_run_do_not_qualify() {
    assert!(!qualifies_as_ritual(RitualQualifyInput {
        game_module_id: "sudoku",
        mode: "archive",
        status: "won",
        is_dry_run: false,
    }));
    assert!(!qualifies_as_ritual(RitualQualifyInput {
        game_module_id: "sudoku",
        mode: "practice",
        status: "won",
        is_dry_run: false,
    }));
    assert!(!qualifies_as_ritual(RitualQualifyInput {
        game_module_id: "sudoku",
        mode: "daily",
        status: "won",
        is_dry_run: true,
    }));
    assert!(!qualifies_as_ritual(RitualQualifyInput {
        game_module_id: "sudoku",
        mode: "daily",
        status: "abandoned",
        is_dry_run: false,
    }));
}

#[test]
fn build_event_maps_finish_kind() {
    let day = NaiveDate::from_ymd_opt(2026, 8, 12).expect("d");
    let ev = build_ritual_completed(
        "user-1",
        "sudoku",
        day,
        "won",
        Some("puzzle-abc".into()),
        1_723_456_789_000,
    )
    .expect("event");
    assert_eq!(ev.day_key, "2026-08-12");
    assert_eq!(ev.finish_kind, FinishKind::Success);
    assert!(ev.is_ritual);
    assert_eq!(ev.module_class, PuzzleRitual);
    assert_eq!(ev.game_module_id, "sudoku");

    let lost = build_ritual_completed("user-1", "sudoku", day, "lost", None, 0).expect("lost");
    assert_eq!(lost.finish_kind, FinishKind::ExhaustedFail);
}

#[test]
fn daily_puzzle_completers_counts_distinct_users_once() {
    let rows = vec![
        row("a", "2026-08-12", PuzzleRitual, true),
        row("a", "2026-08-12", PuzzleRitual, true),
        row("b", "2026-08-12", PuzzleRitual, true),
        row("c", "2026-08-11", PuzzleRitual, true),
        row("d", "2026-08-12", EntertainmentOracle, true),
        row("e", "2026-08-12", PuzzleRitual, false),
    ];
    assert_eq!(compute_drc("2026-08-12", &rows), 2);
    assert_eq!(compute_drc("2026-08-11", &rows), 1);
    assert_eq!(compute_drc("2026-08-10", &rows), 0);
}

fn overview_row(
    user: &str,
    day: &str,
    module: &str,
    class: ModuleClass,
    is_ritual: bool,
) -> RitualOverviewRow {
    RitualOverviewRow {
        user_id: user.into(),
        day_key: day.into(),
        game_module_id: module.into(),
        module_class: class,
        is_ritual,
    }
}

#[test]
fn today_overview_matches_drc_on_ritual_product_day() {
    let rows = vec![
        overview_row("a", "2026-08-12", "sudoku", PuzzleRitual, true),
        overview_row("a", "2026-08-12", "crossword", PuzzleRitual, true),
        overview_row("b", "2026-08-12", "sudoku", PuzzleRitual, true),
        overview_row("c", "2026-08-11", "sudoku", PuzzleRitual, true),
        overview_row("d", "2026-08-12", "oracle", EntertainmentOracle, true),
        // Calendar CURRENT_DATE won-lost residue: not ritual, must not count.
        overview_row("e", "2026-08-12", "sudoku", PuzzleRitual, false),
    ];
    let overview = compute_today_overview("2026-08-12", &rows);
    let drc_rows: Vec<RitualCompletionRow> =
        rows.iter().map(RitualOverviewRow::completion_row).collect();
    assert_eq!(overview.player_count, compute_drc("2026-08-12", &drc_rows));
    assert_eq!(overview.player_count, 2);
    assert_eq!(
        overview.completions,
        vec![("crossword".into(), 1), ("sudoku".into(), 2)]
    );
    assert_eq!(compute_today_overview("2026-08-10", &rows).player_count, 0);
}

fn row(user: &str, day: &str, class: ModuleClass, is_ritual: bool) -> RitualCompletionRow {
    RitualCompletionRow {
        user_id: user.into(),
        day_key: day.into(),
        module_class: class,
        is_ritual,
    }
}

#[test]
fn weekly_ritualists_counts_users_with_four_distinct_days_in_window() {
    let rows = vec![
        row("a", "2026-08-08", PuzzleRitual, true),
        row("a", "2026-08-09", PuzzleRitual, true),
        row("a", "2026-08-10", PuzzleRitual, true),
        row("a", "2026-08-11", PuzzleRitual, true),
        // b has only 3 days
        row("b", "2026-08-10", PuzzleRitual, true),
        row("b", "2026-08-11", PuzzleRitual, true),
        row("b", "2026-08-12", PuzzleRitual, true),
        // c has 4 finishes on the SAME day — one daily-puzzle-completer day
        row("c", "2026-08-12", PuzzleRitual, true),
        row("c", "2026-08-12", PuzzleRitual, true),
        row("c", "2026-08-12", PuzzleRitual, true),
        row("c", "2026-08-12", PuzzleRitual, true),
        // d's fourth day is outside the window ending 2026-08-12
        row("d", "2026-08-05", PuzzleRitual, true),
        row("d", "2026-08-10", PuzzleRitual, true),
        row("d", "2026-08-11", PuzzleRitual, true),
        row("d", "2026-08-12", PuzzleRitual, true),
        // e is entertainment only
        row("e", "2026-08-09", EntertainmentOracle, true),
        row("e", "2026-08-10", EntertainmentOracle, true),
        row("e", "2026-08-11", EntertainmentOracle, true),
        row("e", "2026-08-12", EntertainmentOracle, true),
        // f has 4 days including non-contiguous skips
        row("f", "2026-08-06", PuzzleRitual, true),
        row("f", "2026-08-08", PuzzleRitual, true),
        row("f", "2026-08-10", PuzzleRitual, true),
        row("f", "2026-08-12", PuzzleRitual, true),
    ];
    // Window ending 12th: 6..12. a (8-11)=4, f (6,8,10,12)=4. b=3, c=1, d=3 in-window, e=0.
    assert_eq!(compute_hrc("2026-08-12", &rows), 2);
    assert_eq!(compute_weekly_ritualists("2026-08-12", &rows), 2);
    assert_eq!(compute_hrc("2026-08-11", &rows), 1); // only a; f has 6,8,10 = 3 in [5..11]
    assert_eq!(compute_hrc("not-a-date", &rows), 0);
    assert_eq!(HABITUAL_MIN_DAYS, 4);
    assert_eq!(HABITUAL_WINDOW_DAYS, 7);
    assert_eq!(WEEKLY_RITUALISTS_FIELD, "weekly_ritualists");
}

/// Dogfood residual: first free-daily win with null content_id must still
/// block a second finish the same user/day (daily puzzle completers stay distinct-users, but
/// product one-finish-per-day was soft).
#[test]
fn free_daily_second_finish_blocked_without_puzzle_id() {
    let day = "2026-08-12";
    let user = "f715210b-9df3-4945-b5bd-94fc4609bc30";
    let prior = [row(user, day, PuzzleRitual, true)];
    // Guard must not depend on content/puzzle id.
    assert!(submit_must_guard_already_played(true, None, true));
    assert!(submit_must_guard_already_played(
        true,
        Some("optional-id"),
        true
    ));
    assert!(!submit_must_guard_already_played(false, None, true));
    assert!(!submit_must_guard_already_played(true, None, false));

    assert!(ritual_already_finished(&prior, user, day, "sudoku"));
    // Second submit same day/module is rejected by policy.
    assert!(ritual_already_finished(&prior, user, day, "sudoku"));
    // Different day is open.
    assert!(!ritual_already_finished(
        &prior,
        user,
        "2026-08-13",
        "sudoku"
    ));
    // Different user is open.
    assert!(!ritual_already_finished(
        &prior,
        "other-user",
        day,
        "sudoku"
    ));
}
