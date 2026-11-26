//! Deterministic crowns/queens generator (free-floor fallback).
//!
//! Mirrors `apps/puzzled/src/games/queens/generator.ts#generateQueensPuzzle`.
//! Client payload is `{size, regions}`; queen coordinates stay server-only.
//!
//! The TypeScript generator throws after 10 uniqueness retries. GetDaily must
//! not stub, so this port keeps searching (same seed+attempts+1 LCG walk)
//! until a unique solution exists.
//!
//! RNG is `domain::random` (IEEE-754 / JS `ToInt32` LCG), not `random_lcg`
//! (wrapping `u32`). Queens flood-fill draws enough that the two diverge.

mod layout;
mod puzzle;
mod solver;

pub use puzzle::{
    generate_queens_puzzle, generate_queens_puzzle_with_size, try_generate_queens_puzzle_with_size,
    DEFAULT_QUEENS_SIZE,
};

#[cfg(test)]
mod tests;
