//! Pure Tango (binary sun/moon) rules and submission scoring.

mod conflicts;
mod scoring;
mod solution;
mod types;

pub use conflicts::{
    get_conflict_details, get_conflicts, has_consecutive_violation, ConflictDetails,
    MAX_CONSECUTIVE,
};
pub use scoring::{tango_score, validate_and_score, BASE_WIN_SCORE, MIN_WIN_SCORE};
pub use solution::is_solved;
pub use types::{CellValue, GameResult, SubmissionStatus};

#[cfg(test)]
mod tests;
