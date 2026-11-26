use chrono::{Days, NaiveDate};

use super::days::{previous, sorted_unique, union};

/// Played days of one run that earn a freeze.
pub const FREEZE_EVERY_DAYS: u32 = 7;
/// Most freezes a player can hold at once.
pub const FREEZE_CAP: u32 = 2;
/// Most consecutive missed days one return can cover.
pub const MAX_BRIDGE_DAYS: u32 = 3;
/// A run must have at least this many played days to be worth a freeze.
pub const MIN_RUN_TO_PROTECT: u32 = 2;

/// What to persist so the streak reflects earned and used freezes.
#[derive(Debug, Clone, PartialEq, Eq, Default)]
pub struct Settlement {
    /// Milestone days newly recorded as earned (each is recorded once, ever).
    pub award_days: Vec<NaiveDate>,
    /// Freezes actually added to the held count (the cap can absorb some).
    pub granted: u32,
    /// Missed days a held freeze now covers.
    pub cover_days: Vec<NaiveDate>,
    /// Held freezes after this settlement.
    pub available_after: u32,
}

impl Settlement {
    #[must_use]
    pub fn is_empty(&self) -> bool {
        self.award_days.is_empty() && self.cover_days.is_empty()
    }
}

/// Decide the freeze changes for a player as of `today`.
///
/// `played` and `frozen` are the recorded days; `awarded` the milestone days
/// already recorded; `available` the freezes held now. Only the run that ends
/// at the player's last covered day is considered, and only while it can still
/// be saved (at most [`MAX_BRIDGE_DAYS`] missed days since). Covering needs
/// `auto_enabled`, a run of at least [`MIN_RUN_TO_PROTECT`] played days, and a
/// held freeze for every missed day.
#[must_use]
pub fn settle_freezes(
    today: NaiveDate,
    played: &[NaiveDate],
    frozen: &[NaiveDate],
    awarded: &[NaiveDate],
    available: u32,
    auto_enabled: bool,
) -> Settlement {
    let played = sorted_unique(played);
    let covered: Vec<NaiveDate> = union(&played, frozen)
        .into_iter()
        .filter(|day| *day <= today)
        .collect();
    let idle = Settlement {
        available_after: available,
        ..Settlement::default()
    };
    let Some(last) = covered.last().copied() else {
        return idle;
    };
    let missed = u32::try_from(((today - last).num_days() - 1).max(0)).unwrap_or(u32::MAX);
    if missed > MAX_BRIDGE_DAYS {
        return idle;
    }

    // The run ending at `last`, oldest played day first.
    let mut run_played = Vec::new();
    let mut expected = last;
    for day in covered.iter().rev() {
        if *day != expected {
            break;
        }
        if played.binary_search(day).is_ok() {
            run_played.push(*day);
        }
        match previous(expected) {
            Some(before) => expected = before,
            None => break,
        }
    }
    run_played.reverse();

    let award_days: Vec<NaiveDate> = run_played
        .iter()
        .enumerate()
        .filter(|(index, day)| {
            (index + 1) % FREEZE_EVERY_DAYS as usize == 0 && !awarded.contains(day)
        })
        .map(|(_, day)| *day)
        .collect();
    let room = FREEZE_CAP.saturating_sub(available);
    let granted = u32::try_from(award_days.len())
        .unwrap_or(u32::MAX)
        .min(room);
    let mut available_after = available + granted;

    let mut cover_days = Vec::new();
    let run_length = u32::try_from(run_played.len()).unwrap_or(u32::MAX);
    if missed > 0 && auto_enabled && run_length >= MIN_RUN_TO_PROTECT && missed <= available_after {
        let mut day = last;
        for _ in 0..missed {
            day = day.checked_add_days(Days::new(1)).unwrap_or(day);
            cover_days.push(day);
        }
        available_after -= missed;
    }

    Settlement {
        award_days,
        granted,
        cover_days,
        available_after,
    }
}
