use serde_json::{json, Value};

use super::super::crossword_grid::CROSSWORD_GRID_SIZE;
use super::bank::WORD_SQUARES;

/// Count of curated word squares available for seed selection.
#[must_use]
pub fn word_square_count() -> usize {
    WORD_SQUARES.len()
}

/// Generate puzzle_data + solution JSON for a seed (parity with TS generatePuzzle).
///
/// - `puzzle_data.grid`: 5×5 with `null` black / `""` letter cells
/// - `puzzle_data.clues`: across/down with numbers (matches TS generateClues)
/// - `solution.grid`: 5×5 letter strings (empty string = black; word-square pool has none)
#[must_use]
pub fn generate_crossword_puzzle(seed: i64) -> (Value, Value) {
    let idx = seed.unsigned_abs() as usize % WORD_SQUARES.len();
    let square = &WORD_SQUARES[idx];

    // Client grid: letter cells are empty strings (filled by player).
    let mut client_grid: Vec<Vec<Value>> = Vec::with_capacity(CROSSWORD_GRID_SIZE);
    let mut solution_grid: Vec<Vec<Value>> = Vec::with_capacity(CROSSWORD_GRID_SIZE);
    for word in &square.words {
        let chars: Vec<char> = word.chars().collect();
        debug_assert_eq!(chars.len(), CROSSWORD_GRID_SIZE);
        client_grid.push(vec![Value::String(String::new()); CROSSWORD_GRID_SIZE]);
        solution_grid.push(
            chars
                .into_iter()
                .map(|c| Value::String(c.to_string()))
                .collect(),
        );
    }

    let mut across = Vec::with_capacity(5);
    for (row, (word, clue)) in square.words.iter().zip(square.across.iter()).enumerate() {
        let number = if row == 0 { 1 } else { row + 5 };
        across.push(json!({
            "number": number,
            "clue": clue,
            "row": row,
            "col": 0,
            "length": word.len(),
        }));
    }

    let mut down = Vec::with_capacity(5);
    for (col, (word, clue)) in square.words.iter().zip(square.down.iter()).enumerate() {
        down.push(json!({
            "number": col + 1,
            "clue": clue,
            "row": 0,
            "col": col,
            "length": word.len(),
        }));
    }

    let puzzle_data = json!({
        "grid": client_grid,
        "clues": {
            "across": across,
            "down": down,
        },
    });
    let solution = json!({ "grid": solution_grid });
    debug_assert!(
        !puzzle_data.to_string().contains("\"answer\""),
        "client puzzle_data must not include clue answers"
    );
    (puzzle_data, solution)
}
