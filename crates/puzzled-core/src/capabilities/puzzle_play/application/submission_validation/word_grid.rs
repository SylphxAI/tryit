//! Crossword and word-search game adapters.

use serde::Deserialize;
use serde_json::Value;

use super::{SubmissionEnvelope, SubmissionVerdict};
use crate::capabilities::puzzle_play::domain::scoring::SubmissionStatus;

// ---------------------------------------------------------------------------
// crossword: solution {grid: string[][]}; submission {finalGrid: (string|null)[][]}
// ---------------------------------------------------------------------------

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct CrosswordSubmission {
    final_grid: Vec<Vec<Option<String>>>,
}

pub(super) fn crossword(
    _puzzle_data: &Value,
    solution: &Value,
    env: &SubmissionEnvelope,
) -> SubmissionVerdict {
    use crate::capabilities::puzzle_play::domain::crossword_grid;
    let Ok(sub) = serde_json::from_value::<CrosswordSubmission>(env.data.clone()) else {
        return SubmissionVerdict::invalid("Missing final grid data");
    };
    let Some(grid) = solution.get("grid").and_then(Value::as_array) else {
        return SubmissionVerdict::invalid("Missing crossword solution grid");
    };
    let mut solution_grid: Vec<Vec<String>> = Vec::new();
    for row in grid {
        let row: Vec<String> = row
            .as_array()
            .map(|cells| {
                cells
                    .iter()
                    .filter_map(Value::as_str)
                    .map(ToString::to_string)
                    .collect()
            })
            .unwrap_or_default();
        solution_grid.push(row);
    }
    let result = crossword_grid::validate_and_score(
        &solution_grid,
        Some(&sub.final_grid),
        env.time_spent_ms,
        match env.status {
            SubmissionStatus::Won => crossword_grid::SubmissionStatus::Won,
            SubmissionStatus::Lost => crossword_grid::SubmissionStatus::Lost,
        },
    );
    match result {
        crossword_grid::GameResult::Invalid { error } => {
            const SIZE: usize = crossword_grid::CROSSWORD_GRID_SIZE;
            // Only annotate a fully filled, correctly shaped check. Return positions, never answers.
            if env.status == SubmissionStatus::Won
                && sub.final_grid.len() == SIZE
                && sub.final_grid.iter().all(|row| row.len() == SIZE)
            {
                let mut wrong = 0u32;
                for (r, row) in solution_grid.iter().take(SIZE).enumerate() {
                    for (c, expected) in row.iter().take(SIZE).enumerate() {
                        if expected.is_empty() {
                            continue;
                        }
                        let Some(letter) = sub.final_grid[r][c].as_deref() else {
                            return SubmissionVerdict::invalid(error);
                        };
                        if letter.len() != 1 || !letter.as_bytes()[0].is_ascii_alphabetic() {
                            return SubmissionVerdict::invalid(error);
                        }
                        if !crossword_grid::validate_guess(&solution_grid, r, c, letter) {
                            wrong |= 1 << (r * SIZE + c);
                        }
                    }
                }
                if wrong != 0 {
                    return SubmissionVerdict::invalid(format!(
                        "crossword_incorrect_cells:{wrong}"
                    ));
                }
            }
            SubmissionVerdict::invalid(error)
        }
        crossword_grid::GameResult::Valid { status, score } => SubmissionVerdict::valid(
            match status {
                crossword_grid::SubmissionStatus::Won => SubmissionStatus::Won,
                crossword_grid::SubmissionStatus::Lost => SubmissionStatus::Lost,
            },
            score,
        ),
    }
}

// ---------------------------------------------------------------------------
// word-search: solution {words}; submission {foundWords: string[]}
// ---------------------------------------------------------------------------

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct WordSearchSubmission {
    found_words: Vec<String>,
}

pub(super) fn word_search(
    _puzzle_data: &Value,
    solution: &Value,
    env: &SubmissionEnvelope,
) -> SubmissionVerdict {
    use crate::capabilities::puzzle_play::domain::word_search;
    let Ok(sub) = serde_json::from_value::<WordSearchSubmission>(env.data.clone()) else {
        return SubmissionVerdict::invalid("Missing found words data");
    };
    let Some(words) = solution.get("words").and_then(Value::as_array) else {
        return SubmissionVerdict::invalid("Missing word-search solution words");
    };
    let solution_words: Vec<String> = words
        .iter()
        .filter_map(Value::as_str)
        .map(ToString::to_string)
        .collect();
    let found: Vec<String> = sub
        .found_words
        .iter()
        .map(|w| w.to_ascii_uppercase())
        .collect();
    let result = word_search::validate_and_score(
        &solution_words,
        Some(&found),
        env.time_spent_ms,
        match env.status {
            SubmissionStatus::Won => word_search::SubmissionStatus::Won,
            SubmissionStatus::Lost => word_search::SubmissionStatus::Lost,
        },
    );
    match result {
        word_search::GameResult::Invalid { error } => SubmissionVerdict::invalid(error),
        word_search::GameResult::Valid { status, score } => SubmissionVerdict::valid(
            match status {
                word_search::SubmissionStatus::Won => SubmissionStatus::Won,
                word_search::SubmissionStatus::Lost => SubmissionStatus::Lost,
            },
            score,
        ),
    }
}
