//! Daily generator for `block-slide`: a port with byte parity of the TS
//! generator (`apps/puzzled/src/games/block-slide/generator.ts` + `solver.ts`),
//! checked against `tests/fixtures/generate/block-slide.json`.
//!
//! TS moves to the next seed with `seed * 2 + 1`, which leaves the integer
//! range after ~30 retries and becomes a large JS double. The LCG here keeps
//! the seed as an `f64` and applies exact JS `ToInt32` semantics so those
//! retries match TS too.

mod configuration;
mod generation;
mod random;
mod solver;

#[cfg(test)]
mod tests;

pub use generation::{generate, solution_submission};
