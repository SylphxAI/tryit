//! Daily generator for `pip-place` (Spots): a port with byte parity of
//! `apps/puzzled/src/games/pip-place/generator.ts`, checked against
//! `tests/fixtures/generate/pip-place.json`.
//!
//! A seeded domino tiling of a 4×5 board, the complete double-3 set shuffled
//! onto the pairs, then 6–8 connected regions of size 2–4 whose constraints
//! come from the placed pips. Always succeeds; uniqueness is not required.

mod constraints;
mod payload;
mod regions;
mod tiling;

pub use payload::{generate, solution_submission};

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
struct Cell {
    row: usize,
    col: usize,
}
