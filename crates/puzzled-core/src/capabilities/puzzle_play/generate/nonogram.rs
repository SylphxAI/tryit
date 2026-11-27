//! Daily generator for `nonogram`: a port with byte parity of the TS
//! generator (`apps/puzzled/src/games/nonogram/generator.ts`,
//! `generateNonogramPuzzle`), checked against
//! `tests/fixtures/generate/nonogram.json`.
//!
//! The seed picks one of the pixel-art patterns (`data/nonogram_patterns.json`,
//! extracted verbatim from the TS pool, same order) and one of four
//! transforms (none, horizontal flip, vertical flip, both). Every difficulty
//! uses the 10x10 pool, as in TS.
//!
//! [`generate_line_solvable`] (`rust-nonogram-v2`) makes every new day: it
//! skips forward from the seed's pattern to the next one that line logic
//! solves, so each daily puzzle has exactly one solution and needs no guess.
//! A transform never changes that, since it only mirrors the clues.

use serde::Deserialize;
use serde_json::{json, Value};

use crate::capabilities::puzzle_play::domain::nonogram_clues::generate_clues;
use crate::capabilities::puzzle_play::domain::nonogram_solve::line_solve;
use crate::capabilities::puzzle_play::domain::random::SeededRandom;

const PATTERNS_JSON: &str = include_str!("data/nonogram_patterns.json");

#[derive(Deserialize)]
struct Pattern {
    theme: String,
    rows: Vec<String>,
}

fn patterns() -> Result<Vec<Pattern>, String> {
    serde_json::from_str(PATTERNS_JSON).map_err(|e| format!("nonogram patterns: {e}"))
}

fn pattern_grid(pattern: &Pattern) -> Vec<Vec<bool>> {
    pattern
        .rows
        .iter()
        .map(|row| row.chars().map(|c| c == '1').collect())
        .collect()
}

/// The seed's pattern index (TS: `Math.abs(seed) % PATTERNS.length`).
fn seed_index(seed: i64, pool: &[Pattern]) -> Result<usize, String> {
    if pool.is_empty() {
        return Err("nonogram pattern pool is empty".to_string());
    }
    usize::try_from(seed.unsigned_abs() % pool.len() as u64).map_err(|e| e.to_string())
}

/// V1 `(puzzle_data, solution)` for a seed (TS parity), or why none could be
/// made. Some of its pictures need a guess; new days use
/// [`generate_line_solvable`].
pub fn generate(seed: i64, _difficulty: Option<&str>) -> Result<(Value, Value), String> {
    let pool = patterns()?;
    let index = seed_index(seed, &pool)?;
    build(seed, &pool[index])
}

/// V2 `(puzzle_data, solution)`: the V1 puzzle when line logic solves it,
/// otherwise the same transform of the next pattern that line logic solves.
/// Refuses any result whose clues line logic does not solve to its solution.
pub fn generate_line_solvable(
    seed: i64,
    _difficulty: Option<&str>,
) -> Result<(Value, Value), String> {
    let pool = patterns()?;
    let start = seed_index(seed, &pool)?;
    let pattern = (0..pool.len())
        .map(|step| &pool[(start + step) % pool.len()])
        .find(|p| has_one_line_solution(&pattern_grid(p)))
        .ok_or("no nonogram pattern is line-solvable")?;
    let (puzzle_data, solution) = build(seed, pattern)?;
    let grid: Vec<Vec<bool>> = serde_json::from_value(solution["grid"].clone())
        .map_err(|e| format!("nonogram solution: {e}"))?;
    if !has_one_line_solution(&grid) {
        return Err(format!("nonogram seed {seed}: clues need a guess"));
    }
    Ok((puzzle_data, solution))
}

/// True when line logic alone solves the grid's clues back to the grid, so
/// it is their only solution.
#[must_use]
pub fn has_one_line_solution(grid: &[Vec<bool>]) -> bool {
    let (rows, cols) = generate_clues(grid);
    line_solve(&rows, &cols).as_deref() == Some(grid)
}

fn build(seed: i64, pattern: &Pattern) -> Result<(Value, Value), String> {
    let mut grid = pattern_grid(pattern);

    // TS transformPattern: Math.floor(random() * 4)
    let mut random = SeededRandom::new(seed);
    let transform = (random.next_f64() * 4.0).floor() as u32;
    match transform {
        1 => grid.iter_mut().for_each(|row| row.reverse()),
        2 => grid.reverse(),
        3 => {
            grid.reverse();
            grid.iter_mut().for_each(|row| row.reverse());
        }
        _ => {}
    }

    let (row_clues, col_clues) = generate_clues(&grid);
    let puzzle_data = json!({
        "width": 10,
        "height": 10,
        "rowClues": row_clues,
        "colClues": col_clues,
        "theme": pattern.theme,
    });
    let solution = json!({ "grid": grid });
    Ok((puzzle_data, solution))
}

/// The solution rewritten as the submission the validator grades, for the
/// generator self-check: `{finalGrid: boolean[][]}`.
#[must_use]
pub fn solution_submission(solution: &Value) -> Value {
    json!({
        "finalGrid": solution.get("grid").cloned().unwrap_or(Value::Null),
        "errors": 0,
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    fn grid_of(solution: &Value) -> Vec<Vec<bool>> {
        serde_json::from_value(solution["grid"].clone()).unwrap()
    }

    #[test]
    fn v2_puzzles_all_have_one_line_solution_and_keep_good_v1_days() {
        let len = patterns().unwrap().len() as i64;
        let mut replaced = 0;
        for seed in 20_261_101..20_261_101 + len * 4 {
            let v1 = generate(seed, None).unwrap();
            let v2 = generate_line_solvable(seed, None).unwrap();
            assert!(has_one_line_solution(&grid_of(&v2.1)), "seed {seed}");
            if has_one_line_solution(&grid_of(&v1.1)) {
                assert_eq!(v1, v2, "seed {seed}: a line-solvable V1 day changed");
            } else {
                replaced += 1;
            }
        }
        // 12 of the 52 pictures need a guess (6 of them have two solutions).
        assert_eq!(replaced, 12 * 4);
    }

    #[test]
    fn two_solution_picture_is_refused_and_unique_one_accepted() {
        let pool = patterns().unwrap();
        let find = |theme: &str| pattern_grid(pool.iter().find(|p| p.theme == theme).unwrap());
        // Sun has a second grid with the same clues (exhaustive search).
        assert!(!has_one_line_solution(&find("Sun")));
        assert!(has_one_line_solution(&find("Heart")));
    }
}
