use chrono::NaiveDate;

use super::days::{previous, sorted_unique, union};
use super::settlement::FREEZE_EVERY_DAYS;

/// Personal habit projection for one player.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct PersonalStreak {
    pub current_streak: u32,
    pub max_streak: u32,
    pub has_played_today: bool,
    /// Played days still needed to earn the next freeze (1..=7).
    pub days_until_next_freeze: u32,
    /// Yesterday was missed and a freeze kept the run alive.
    pub freeze_used_yesterday: bool,
    /// Distinct product days with an accepted finish (several modules on one
    /// day count once).
    pub played_days: u32,
}

/// Compute current/max streak and has-played-today from accepted ritual days
/// and the days a freeze covered.
///
/// `days` may include duplicates (several catalog modules on one product day).
/// A missed, uncovered yesterday resets `current_streak` but leaves
/// `max_streak`. Playing today is not required to keep yesterday's run visible
/// (at-risk). A covered day bridges a gap but is not counted.
#[must_use]
pub fn compute_personal_streak(
    today: NaiveDate,
    days: &[NaiveDate],
    frozen: &[NaiveDate],
) -> PersonalStreak {
    let played = sorted_unique(days);
    let covered = union(&played, frozen);

    let has_played_today = played.binary_search(&today).is_ok();
    let max_streak = longest_run(&covered, &played);
    let yesterday = previous(today);
    let current_end = if has_played_today {
        Some(today)
    } else {
        yesterday
    };
    let current_streak = current_end.map_or(0, |end| run_ending_on(&covered, &played, end));
    let freeze_used_yesterday = yesterday.is_some_and(|y| {
        played.binary_search(&y).is_err() && frozen.contains(&y) && current_streak > 0
    });

    PersonalStreak {
        current_streak,
        max_streak,
        has_played_today,
        days_until_next_freeze: FREEZE_EVERY_DAYS - current_streak % FREEZE_EVERY_DAYS,
        freeze_used_yesterday,
        played_days: u32::try_from(played.len()).unwrap_or(u32::MAX),
    }
}

fn longest_run(covered: &[NaiveDate], played: &[NaiveDate]) -> u32 {
    let mut best = 0u32;
    let mut current = 0u32;
    let mut before: Option<NaiveDate> = None;
    for &day in covered {
        if !before.is_some_and(|b| previous(day) == Some(b)) {
            current = 0;
        }
        if played.binary_search(&day).is_ok() {
            current = current.saturating_add(1);
        }
        best = best.max(current);
        before = Some(day);
    }
    best
}

fn run_ending_on(covered: &[NaiveDate], played: &[NaiveDate], end: NaiveDate) -> u32 {
    if covered.binary_search(&end).is_err() {
        return 0;
    }
    let mut count = 0u32;
    let mut expected = end;
    for &day in covered.iter().rev() {
        if day > expected {
            continue;
        }
        if day != expected {
            break;
        }
        if played.binary_search(&day).is_ok() {
            count = count.saturating_add(1);
        }
        match previous(expected) {
            Some(before) => expected = before,
            None => break,
        }
    }
    count
}
