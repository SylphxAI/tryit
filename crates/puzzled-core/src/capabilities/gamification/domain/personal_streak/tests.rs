use chrono::NaiveDate;

use super::*;

fn d(year: i32, month: u32, day: u32) -> NaiveDate {
    NaiveDate::from_ymd_opt(year, month, day).expect("date")
}

#[test]
fn empty_history_is_honest_zeros() {
    let today = d(2026, 8, 22);
    let streak = compute_personal_streak(today, &[], &[]);
    assert_eq!(
        streak,
        PersonalStreak {
            current_streak: 0,
            max_streak: 0,
            has_played_today: false,
            days_until_next_freeze: 7,
            freeze_used_yesterday: false,
            played_days: 0,
        }
    );
}

#[test]
fn catalog_modules_on_the_same_day_count_once() {
    let today = d(2026, 8, 22);
    let days = [
        d(2026, 8, 20),
        d(2026, 8, 21),
        d(2026, 8, 21),
        d(2026, 8, 22),
        d(2026, 8, 22),
    ];
    let streak = compute_personal_streak(today, &days, &[]);
    assert_eq!(streak.current_streak, 3);
    assert_eq!(streak.max_streak, 3);
    assert!(streak.has_played_today);
    assert_eq!(streak.played_days, 3);
}

#[test]
fn played_days_counts_gaps_and_ignores_frozen_days() {
    let today = d(2026, 8, 22);
    let days = [
        d(2026, 8, 10),
        d(2026, 8, 10),
        d(2026, 8, 20),
        d(2026, 8, 22),
    ];
    let streak = compute_personal_streak(today, &days, &[d(2026, 8, 21)]);
    assert_eq!(streak.played_days, 3);
}

#[test]
fn sudoku_finish_counts_when_word_guess_is_absent() {
    let today = d(2026, 8, 22);
    let days = [d(2026, 8, 21), d(2026, 8, 22)];
    let streak = compute_personal_streak(today, &days, &[]);
    assert_eq!(streak.current_streak, 2);
    assert!(streak.has_played_today);
}

#[test]
fn prior_run_stays_visible_when_today_is_at_risk() {
    let today = d(2026, 8, 22);
    let days = [d(2026, 8, 20), d(2026, 8, 21)];
    let streak = compute_personal_streak(today, &days, &[]);
    assert_eq!(streak.current_streak, 2);
    assert_eq!(streak.max_streak, 2);
    assert!(!streak.has_played_today);
}

#[test]
fn missed_yesterday_resets_current_and_keeps_max() {
    let today = d(2026, 8, 22);
    let days = [
        d(2026, 8, 16),
        d(2026, 8, 17),
        d(2026, 8, 18),
        d(2026, 8, 19),
    ];
    let streak = compute_personal_streak(today, &days, &[]);
    assert_eq!(streak.current_streak, 0);
    assert_eq!(streak.max_streak, 4);
    assert!(!streak.has_played_today);
}

#[test]
fn today_alone_starts_a_new_run_after_a_gap() {
    let today = d(2026, 8, 22);
    let days = [d(2026, 8, 10), d(2026, 8, 11), d(2026, 8, 22)];
    let streak = compute_personal_streak(today, &days, &[]);
    assert_eq!(streak.current_streak, 1);
    assert_eq!(streak.max_streak, 2);
    assert!(streak.has_played_today);
}

#[test]
fn unsorted_days_still_agree() {
    let today = d(2026, 8, 22);
    let days = [d(2026, 8, 22), d(2026, 8, 20), d(2026, 8, 21)];
    let streak = compute_personal_streak(today, &days, &[]);
    assert_eq!(streak.current_streak, 3);
    assert_eq!(streak.max_streak, 3);
}

#[test]
fn malformed_day_key_fails_closed() {
    assert!(parse_day_key("").is_err());
    assert!(parse_day_key("today").is_err());
    assert!(parse_day_key("2026-13-01").is_err());
    assert_eq!(parse_day_key("2026-08-22").expect("day"), d(2026, 8, 22));
    assert!(parse_accepted_day_keys(["2026-08-21", "nope"]).is_err());
    assert_eq!(
        parse_accepted_day_keys(["2026-08-21", "2026-08-22"]).expect("days"),
        vec![d(2026, 8, 21), d(2026, 8, 22)]
    );
}

fn days(list: &[(u32, u32)]) -> Vec<NaiveDate> {
    list.iter().map(|(m, day)| d(2026, *m, *day)).collect()
}

fn run(from: u32, to: u32) -> Vec<NaiveDate> {
    (from..=to).map(|day| d(2026, 8, day)).collect()
}

#[test]
fn a_covered_day_bridges_the_run_but_is_not_counted() {
    let today = d(2026, 8, 22);
    let played = days(&[(8, 18), (8, 19), (8, 21), (8, 22)]);
    let frozen = days(&[(8, 20)]);
    let streak = compute_personal_streak(today, &played, &frozen);
    assert_eq!(streak.current_streak, 4);
    assert_eq!(streak.max_streak, 4);
    let bare = compute_personal_streak(today, &played, &[]);
    assert_eq!(bare.current_streak, 2);
}

#[test]
fn yesterday_covered_keeps_the_run_alive_and_says_so() {
    let today = d(2026, 8, 22);
    let played = days(&[(8, 19), (8, 20)]);
    let frozen = days(&[(8, 21)]);
    let streak = compute_personal_streak(today, &played, &frozen);
    assert_eq!(streak.current_streak, 2);
    assert!(streak.freeze_used_yesterday);
    assert!(!streak.has_played_today);
}

#[test]
fn days_until_next_freeze_counts_down_and_restarts() {
    let today = d(2026, 8, 22);
    let three = days(&[(8, 20), (8, 21), (8, 22)]);
    assert_eq!(
        compute_personal_streak(today, &three, &[]).days_until_next_freeze,
        4
    );
    let seven = run(16, 22);
    assert_eq!(
        compute_personal_streak(today, &seven, &[]).days_until_next_freeze,
        7
    );
}

#[test]
fn the_seventh_played_day_earns_a_freeze_once() {
    let today = d(2026, 8, 7);
    let played = run(1, 7);
    let first = settle_freezes(today, &played, &[], &[], 0, true);
    assert_eq!(first.award_days, vec![d(2026, 8, 7)]);
    assert_eq!(first.granted, 1);
    assert_eq!(first.available_after, 1);
    assert!(first.cover_days.is_empty());
    let again = settle_freezes(today, &played, &[], &first.award_days, 1, true);
    assert!(again.is_empty());
    assert_eq!(again.granted, 0);
}

#[test]
fn six_days_earn_nothing_and_fourteen_earn_two() {
    assert!(settle_freezes(d(2026, 8, 6), &run(1, 6), &[], &[], 0, true).is_empty());
    let fourteen = settle_freezes(d(2026, 8, 14), &run(1, 14), &[], &[], 0, true);
    assert_eq!(fourteen.award_days, vec![d(2026, 8, 7), d(2026, 8, 14)]);
    assert_eq!(fourteen.granted, 2);
}

#[test]
fn holding_the_cap_records_the_milestone_but_grants_nothing() {
    let settled = settle_freezes(d(2026, 8, 7), &run(1, 7), &[], &[], FREEZE_CAP, true);
    assert_eq!(settled.award_days, vec![d(2026, 8, 7)]);
    assert_eq!(settled.granted, 0);
    assert_eq!(settled.available_after, FREEZE_CAP);
}

#[test]
fn a_covered_day_does_not_count_toward_the_next_freeze() {
    let mut played = run(1, 5);
    played.push(d(2026, 8, 7));
    let frozen = vec![d(2026, 8, 6)];
    let settled = settle_freezes(d(2026, 8, 7), &played, &frozen, &[], 0, true);
    assert!(settled.award_days.is_empty(), "7 run days, only 6 played");
    played.push(d(2026, 8, 8));
    let settled = settle_freezes(d(2026, 8, 8), &played, &frozen, &[], 0, true);
    assert_eq!(settled.award_days, vec![d(2026, 8, 8)]);
}

#[test]
fn a_held_freeze_covers_one_missed_day() {
    let today = d(2026, 8, 9);
    let settled = settle_freezes(today, &run(5, 7), &[], &[], 1, true);
    assert_eq!(settled.cover_days, vec![d(2026, 8, 8)]);
    assert_eq!(settled.available_after, 0);
    let streak = compute_personal_streak(today, &run(5, 7), &settled.cover_days);
    assert_eq!(streak.current_streak, 3);
    assert!(streak.freeze_used_yesterday);
}

#[test]
fn covering_needs_a_freeze_the_setting_and_a_real_run() {
    let today = d(2026, 8, 9);
    assert!(settle_freezes(today, &run(5, 7), &[], &[], 0, true)
        .cover_days
        .is_empty());
    assert!(settle_freezes(today, &run(5, 7), &[], &[], 2, false)
        .cover_days
        .is_empty());
    assert!(settle_freezes(today, &run(7, 7), &[], &[], 2, true)
        .cover_days
        .is_empty());
}

#[test]
fn two_missed_days_need_two_freezes_and_four_are_too_many() {
    let today = d(2026, 8, 10);
    let two = settle_freezes(today, &run(5, 7), &[], &[], 2, true);
    assert_eq!(two.cover_days, vec![d(2026, 8, 8), d(2026, 8, 9)]);
    assert_eq!(two.available_after, 0);
    assert!(settle_freezes(today, &run(5, 7), &[], &[], 1, true)
        .cover_days
        .is_empty());
    let late = settle_freezes(d(2026, 8, 12), &run(5, 7), &[], &[], 2, true);
    assert!(late.cover_days.is_empty(), "four missed days lose the run");
}

#[test]
fn nothing_is_covered_when_no_day_was_missed() {
    let settled = settle_freezes(d(2026, 8, 8), &run(5, 7), &[], &[], 2, true);
    assert!(settled.cover_days.is_empty());
    assert_eq!(settled.available_after, 2);
}

#[test]
fn a_return_can_earn_and_use_in_one_settlement() {
    let settled = settle_freezes(d(2026, 8, 9), &run(1, 7), &[], &[], 0, true);
    assert_eq!(settled.granted, 1);
    assert_eq!(settled.cover_days, vec![d(2026, 8, 8)]);
    assert_eq!(settled.available_after, 0);
}

#[test]
fn empty_history_settles_to_nothing() {
    let settled = settle_freezes(d(2026, 8, 9), &[], &[], &[], 1, true);
    assert!(settled.is_empty());
    assert_eq!(settled.available_after, 1);
}
