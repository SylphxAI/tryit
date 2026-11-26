//! Personal streak from accepted ritual product days, bridged by freezes.
//!
//! The streak is a pure projection of distinct `game_sessions` product days that
//! already qualified as ritual completions (archive, practice and abandoned rows
//! never count) plus the days a streak freeze covered. A covered day keeps the
//! run alive but adds nothing to its length.
//!
//! Freezes are earned by play: one for every [`FREEZE_EVERY_DAYS`] played days of
//! a run, at most [`FREEZE_CAP`] held. [`settle_freezes`] decides, from the same
//! days, which milestones are newly earned and which missed days a held freeze
//! covers; the shell only persists its answer.

mod days;
mod runs;
mod settlement;

pub use days::{parse_accepted_day_keys, parse_day_key, InvalidDayKey};
pub use runs::{compute_personal_streak, PersonalStreak};
pub use settlement::{
    settle_freezes, Settlement, FREEZE_CAP, FREEZE_EVERY_DAYS, MAX_BRIDGE_DAYS, MIN_RUN_TO_PROTECT,
};

#[cfg(test)]
mod tests;
