//! Deterministic mini-crossword generator, V1 (`rust-v1`): the frozen legacy
//! pool.
//!
//! Ported from the TypeScript generator (`apps/puzzled/src/games/crossword/`,
//! which stays only as the reference). Pipeline days from 2026-09-28 use
//! [`super::crossword_v2`]; this pool still serves the days before the
//! pipeline (their original seeds, see `daily_pipeline::generate_for`) and
//! reproduces every stored V1 row. Do not change it: `v1_output_is_frozen`
//! pins its output.
//!
//! Its "down" clues are the row words' second clues, so they are wrong for every
//! square whose columns spell other words (all but HEART); `served_payload`
//! hides them for stored V1 rows.
//!
//! Skips the one malformed 6-letter "ERMINE" entry from the TS pool (34 of 35).

mod bank;
mod generate;
mod redact;

pub use generate::{generate_crossword_puzzle, word_square_count};
pub use redact::client_safe_puzzle_data;

#[cfg(test)]
mod tests;
