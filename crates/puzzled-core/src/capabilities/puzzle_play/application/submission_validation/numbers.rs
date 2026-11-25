//! Equation and Sudoku game adapters.

use serde::Deserialize;
use serde_json::Value;

use super::{SubmissionEnvelope, SubmissionVerdict};
use crate::capabilities::puzzle_play::domain::scoring::SubmissionStatus;

// ---------------------------------------------------------------------------
// sudoku: solution {grid: number[][]}; submission {finalGrid: (number|null)[][]}
// ---------------------------------------------------------------------------

pub(super) fn sudoku(
    puzzle_data: &Value,
    _solution: &Value,
    env: &SubmissionEnvelope,
) -> SubmissionVerdict {
    use crate::capabilities::puzzle_play::domain::sudoku_scoring::{
        validate_and_score_sudoku, GameSubmission, ScoringResult, SubmissionStatus as Ss,
    };
    use crate::capabilities::puzzle_play::sudoku::SudokuPuzzleData;
    let Ok(puzzle) = serde_json::from_value::<SudokuPuzzleData>(puzzle_data.clone()) else {
        return SubmissionVerdict::invalid("Invalid sudoku given clues");
    };
    let game_submission = GameSubmission {
        status: match env.status {
            SubmissionStatus::Won => Ss::Won,
            SubmissionStatus::Lost => Ss::Lost,
        },
        attempts: env.attempts,
        time_spent_ms: env.time_spent_ms,
        data: Some(env.data.clone()),
    };
    match validate_and_score_sudoku(&puzzle, &game_submission) {
        ScoringResult::Valid {
            valid,
            status,
            score,
        } => {
            if !valid {
                SubmissionVerdict::invalid("Invalid sudoku solution")
            } else {
                SubmissionVerdict::valid(
                    match status {
                        Ss::Won => SubmissionStatus::Won,
                        Ss::Lost => SubmissionStatus::Lost,
                    },
                    score,
                )
            }
        }
        ScoringResult::Invalid { valid, error } => {
            let _ = valid;
            SubmissionVerdict::invalid(error)
        }
    }
}

// ---------------------------------------------------------------------------
// arithmo: solution {equation: string}; submission {guesses: string[]}
// ---------------------------------------------------------------------------

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct ArithmoSubmission {
    guesses: Vec<String>,
}

pub(super) fn arithmo(
    _puzzle_data: &Value,
    solution: &Value,
    env: &SubmissionEnvelope,
) -> SubmissionVerdict {
    use crate::capabilities::puzzle_play::domain::arithmo;
    let Ok(sub) = serde_json::from_value::<ArithmoSubmission>(env.data.clone()) else {
        return SubmissionVerdict::invalid("Missing guesses data");
    };
    let Some(equation) = solution.get("equation").and_then(Value::as_str) else {
        return SubmissionVerdict::invalid("Missing solution equation");
    };
    let result = arithmo::validate_and_score(
        equation,
        Some(&sub.guesses),
        match env.status {
            SubmissionStatus::Won => arithmo::SubmissionStatus::Won,
            SubmissionStatus::Lost => arithmo::SubmissionStatus::Lost,
        },
    );
    match result {
        arithmo::GameResult::Invalid { error } => SubmissionVerdict::invalid(error),
        arithmo::GameResult::Valid { status, score } => SubmissionVerdict::valid(
            match status {
                arithmo::SubmissionStatus::Won => SubmissionStatus::Won,
                arithmo::SubmissionStatus::Lost => SubmissionStatus::Lost,
            },
            score,
        ),
    }
}

// ---------------------------------------------------------------------------
// killer-sudoku: solution {grid}; submission {finalGrid, mistakes}
// ---------------------------------------------------------------------------

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct KillerSudokuSubmission {
    final_grid: Vec<Vec<Option<u8>>>,
    #[serde(default)]
    mistakes: Option<u32>,
}

pub(super) fn killer_sudoku(
    _puzzle_data: &Value,
    solution: &Value,
    env: &SubmissionEnvelope,
) -> SubmissionVerdict {
    use crate::capabilities::puzzle_play::domain::killer_sudoku;
    let Ok(sub) = serde_json::from_value::<KillerSudokuSubmission>(env.data.clone()) else {
        return SubmissionVerdict::invalid("Missing final grid data");
    };
    let Some(grid) = solution.get("grid").and_then(Value::as_array) else {
        return SubmissionVerdict::invalid("Missing killer-sudoku solution grid");
    };
    let mut solution_grid: Vec<Vec<u8>> = Vec::new();
    for row in grid {
        let row: Vec<u8> = row
            .as_array()
            .map(|cells| {
                cells
                    .iter()
                    .filter_map(Value::as_u64)
                    .map(|v| v as u8)
                    .collect()
            })
            .unwrap_or_default();
        solution_grid.push(row);
    }
    let result = killer_sudoku::validate_and_score(
        &solution_grid,
        Some(&sub.final_grid),
        sub.mistakes.unwrap_or(0),
        env.time_spent_ms,
        match env.status {
            SubmissionStatus::Won => killer_sudoku::SubmissionStatus::Won,
            SubmissionStatus::Lost => killer_sudoku::SubmissionStatus::Lost,
        },
    );
    match result {
        killer_sudoku::GameResult::Invalid { error } => SubmissionVerdict::invalid(error),
        killer_sudoku::GameResult::Valid { status, score } => SubmissionVerdict::valid(
            match status {
                killer_sudoku::SubmissionStatus::Won => SubmissionStatus::Won,
                killer_sudoku::SubmissionStatus::Lost => SubmissionStatus::Lost,
            },
            score,
        ),
    }
}
