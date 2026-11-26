//! Pure Block Slide board rules, shortest-path solver, and scoring.

mod moves;
mod scoring;
mod solver;
mod types;

pub use moves::{blocks_overlap, can_move, is_valid_configuration, is_win, move_block};
pub use scoring::{
    block_slide_score, validate_and_score, BASE_WIN_SCORE, EXTRA_MOVE_PENALTY, FAST_SOLVE_BONUS,
    FAST_SOLVE_MS, MIN_WIN_SCORE,
};
pub use solver::{serialize_state, solve_puzzle, DEFAULT_MAX_MOVES};
pub use types::{Block, BlockSlidePuzzle, Direction, GameResult, SolveResult, SubmissionStatus};

#[cfg(test)]
mod tests;
