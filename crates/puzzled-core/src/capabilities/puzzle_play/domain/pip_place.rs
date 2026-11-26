//! Pure pip-place (Spots) is_solved + score — mirrors
//! `apps/puzzled/src/games/pip-place/types.ts#isSolved` and
//! `config.ts#validateAndScore`.
//! Win is any covering that uses the complete double-n set and satisfies
//! every region constraint; stored seed tiles are ignored.

mod rules;
mod scoring;
mod types;

pub use rules::is_solved;
pub use scoring::{pip_place_score, validate_and_score, BASE_WIN_SCORE, MIN_WIN_SCORE};
pub use types::{Cell, GameResult, Puzzle, Region, RegionKind, SubmissionStatus, Tile};

#[cfg(test)]
mod tests;
