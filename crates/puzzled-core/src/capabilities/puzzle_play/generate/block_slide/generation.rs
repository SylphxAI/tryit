use serde_json::{json, Value};

use super::configuration::{
    generate_configuration, is_valid_configuration, EXIT_X, EXIT_Y, GRID_HEIGHT, GRID_WIDTH,
};
use super::random::JsLcg;
use super::solver::solve;

const TS_ATTEMPTS: usize = 100;
/// Past the TS limit, keep following the same seed sequence.
const MAX_ATTEMPTS: usize = 2_000;

/// `(puzzle_data, solution)` for a seed, or why none could be made.
pub fn generate(seed: i64, difficulty: Option<&str>) -> Result<(Value, Value), String> {
    generate_counted(seed, difficulty).0
}

/// [`generate`] plus the most states a single solve visited on the way.
pub(super) fn generate_counted(
    seed: i64,
    difficulty: Option<&str>,
) -> (Result<(Value, Value), String>, usize) {
    let (min, max) = match difficulty.unwrap_or("medium") {
        "easy" => (4, 15),
        "hard" => (36, 80),
        _ => (16, 35),
    };
    let mut most_states = 0;
    let mut current = seed as f64;
    for attempt in 0..MAX_ATTEMPTS {
        // Past the TS limit the doubled seed overflows to infinity; restart
        // from a derived seed so the sequence keeps producing puzzles.
        if attempt == TS_ATTEMPTS || !current.is_finite() {
            current = (seed + (attempt as i64) * 1_000_003) as f64;
        }
        let mut random = JsLcg { state: current };
        let next = current * 2.0 + 1.0;
        let Some(blocks) = generate_configuration(&mut random) else {
            current = next;
            continue;
        };
        if !is_valid_configuration(&blocks) {
            current = next;
            continue;
        }
        let (solved, states) = solve(&blocks, 120);
        most_states = most_states.max(states);
        match solved {
            Some(moves) if (min..=max).contains(&moves) => {
                let blocks_json: Vec<Value> = blocks
                    .iter()
                    .map(|b| {
                        json!({
                            "id": b.id, "x": b.x, "y": b.y,
                            "width": b.width, "height": b.height, "isTarget": b.is_target,
                        })
                    })
                    .collect();
                return (
                    Ok((
                        json!({
                            "blocks": blocks_json,
                            "gridWidth": GRID_WIDTH, "gridHeight": GRID_HEIGHT,
                            "exitX": EXIT_X, "exitY": EXIT_Y, "minMoves": moves,
                        }),
                        json!({ "minMoves": moves }),
                    )),
                    most_states,
                );
            }
            _ => current = next,
        }
    }
    (
        Err(format!(
            "block-slide: no puzzle for seed {seed} within {MAX_ATTEMPTS} attempts"
        )),
        most_states,
    )
}

/// The solution rewritten as the submission the validator grades, for the
/// generator self-check.
#[must_use]
pub fn solution_submission(solution: &Value) -> Value {
    json!({ "moveCount": solution.get("minMoves").cloned().unwrap_or(Value::Null) })
}
