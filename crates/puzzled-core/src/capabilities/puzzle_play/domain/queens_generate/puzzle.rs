use serde_json::{json, Value};

use super::layout::{try_generate, MAX_UNIQUENESS_ATTEMPTS};

/// Default board size (`generateQueensPuzzle` / medium difficulty).
pub const DEFAULT_QUEENS_SIZE: usize = 6;

/// Deterministic daily crowns: (client-safe puzzle_data, solution).
#[must_use]
pub fn generate_queens_puzzle(seed: i64) -> (Value, Value) {
    generate_queens_puzzle_with_size(seed, DEFAULT_QUEENS_SIZE)
}

/// Generate a crowns/queens puzzle of the given board size (5–8 in product),
/// or why none was found within the retry bound.
pub fn try_generate_queens_puzzle_with_size(
    seed: i64,
    size: usize,
) -> Result<(Value, Value), String> {
    let size = match size {
        5..=8 => size,
        _ => DEFAULT_QUEENS_SIZE,
    };
    let (regions, queens) = try_generate(seed, size).ok_or_else(|| {
        format!(
            "Queens: no puzzle with a unique solution for seed {seed} after {MAX_UNIQUENESS_ATTEMPTS} attempts"
        )
    })?;
    let puzzle_data = json!({
        "size": size,
        "regions": regions,
    });
    let queens_json: Vec<Value> = queens
        .into_iter()
        .map(|(row, col)| json!([row, col]))
        .collect();
    Ok((puzzle_data, json!({ "queens": queens_json })))
}

/// Generate a crowns/queens puzzle of the given board size (5–8 in product).
///
/// Never panics. If no unique puzzle exists within the (generous) retry bound,
/// it returns an empty board with no solution, which the game's validator and
/// the pipeline self-check refuse, so it is never served as a real puzzle.
#[must_use]
pub fn generate_queens_puzzle_with_size(seed: i64, size: usize) -> (Value, Value) {
    try_generate_queens_puzzle_with_size(seed, size).unwrap_or_else(|_| {
        (
            json!({ "size": size, "regions": [] }),
            json!({ "queens": [] }),
        )
    })
}
