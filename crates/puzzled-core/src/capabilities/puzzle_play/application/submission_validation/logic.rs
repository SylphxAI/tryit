//! Visual pattern, grid-constraint, and deduction game adapters.

use serde::Deserialize;
use serde_json::Value;

use super::{SubmissionEnvelope, SubmissionVerdict};
use crate::capabilities::puzzle_play::domain::scoring::SubmissionStatus;

// ---------------------------------------------------------------------------
// nonogram: solution {grid: boolean[][]}; submission {finalGrid: boolean[][]}
// ---------------------------------------------------------------------------

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct NonogramSubmission {
    final_grid: Vec<Vec<bool>>,
}

pub(super) fn nonogram(
    _puzzle_data: &Value,
    solution: &Value,
    env: &SubmissionEnvelope,
) -> SubmissionVerdict {
    use crate::capabilities::puzzle_play::domain::nonogram_clues;
    let Ok(sub) = serde_json::from_value::<NonogramSubmission>(env.data.clone()) else {
        return SubmissionVerdict::invalid("Missing final grid data");
    };
    let Some(grid) = solution.get("grid").and_then(Value::as_array) else {
        return SubmissionVerdict::invalid("Missing nonogram solution grid");
    };
    let mut solution_grid: Vec<Vec<bool>> = Vec::new();
    for row in grid {
        let row: Vec<bool> = row
            .as_array()
            .map(|cells| cells.iter().filter_map(Value::as_bool).collect())
            .unwrap_or_default();
        solution_grid.push(row);
    }
    let errors = env.data.get("errors").and_then(Value::as_u64).unwrap_or(0) as u32;
    let result = nonogram_clues::validate_and_score(
        &solution_grid,
        Some(&sub.final_grid),
        errors,
        env.time_spent_ms,
        match env.status {
            SubmissionStatus::Won => nonogram_clues::SubmissionStatus::Won,
            SubmissionStatus::Lost => nonogram_clues::SubmissionStatus::Lost,
        },
    );
    match result {
        nonogram_clues::GameResult::Invalid { error } => SubmissionVerdict::invalid(error),
        nonogram_clues::GameResult::Valid { status, score } => SubmissionVerdict::valid(
            match status {
                nonogram_clues::SubmissionStatus::Won => SubmissionStatus::Won,
                nonogram_clues::SubmissionStatus::Lost => SubmissionStatus::Lost,
            },
            score,
        ),
    }
}

// ---------------------------------------------------------------------------
// pattern-match: solution {validSets: [n,n,n][], totalSets};
// submission {foundSets: number[][], mistakes: number}
// ---------------------------------------------------------------------------

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct PatternMatchSubmission {
    #[serde(default)]
    found_sets: Option<Vec<Vec<u16>>>,
    #[serde(default)]
    mistakes: Option<u32>,
}

pub(super) fn pattern_match(
    _puzzle_data: &Value,
    solution: &Value,
    env: &SubmissionEnvelope,
) -> SubmissionVerdict {
    let Ok(sub) = serde_json::from_value::<PatternMatchSubmission>(env.data.clone()) else {
        return SubmissionVerdict::invalid("Invalid pattern-match submission");
    };
    let Some(valid_sets) = solution.get("validSets").and_then(Value::as_array) else {
        return SubmissionVerdict::invalid("Missing validSets solution");
    };
    let mut expected: Vec<Vec<u16>> = Vec::new();
    for set in valid_sets {
        let set: Vec<u16> = set
            .as_array()
            .map(|idx| {
                idx.iter()
                    .filter_map(Value::as_u64)
                    .map(|v| v as u16)
                    .collect()
            })
            .unwrap_or_default();
        if set.len() == 3 {
            expected.push(set);
        }
    }
    let Some(found) = sub.found_sets.as_ref() else {
        return SubmissionVerdict::invalid("Missing foundSets data");
    };
    let mistakes = sub.mistakes.unwrap_or(0);
    if mistakes > 4 {
        return SubmissionVerdict::invalid("Too many mistakes");
    }
    let mut seen: std::collections::HashSet<Vec<u16>> = std::collections::HashSet::new();
    for set in found {
        let mut sorted = set.clone();
        sorted.sort_unstable();
        if !expected.iter().any(|e| {
            let mut es = e.clone();
            es.sort_unstable();
            es == sorted
        }) {
            return SubmissionVerdict::invalid("Invalid set found");
        }
        if !seen.insert(sorted) {
            return SubmissionVerdict::invalid("Duplicate set");
        }
    }
    let total = solution
        .get("totalSets")
        .and_then(Value::as_u64)
        .unwrap_or(expected.len() as u64) as usize;
    let found_all = found.len() == total;
    // Mirrors `apps/puzzled/src/games/pattern-match/config.ts`: a give-up is an
    // honest terminal scored 0, a "lost" claim with every set found is rejected,
    // and a win still requires all sets.
    match env.status {
        SubmissionStatus::Won if !found_all => SubmissionVerdict::invalid("Not all sets found"),
        SubmissionStatus::Lost if found_all => {
            SubmissionVerdict::invalid("Invalid loss claim - all sets found")
        }
        SubmissionStatus::Won => SubmissionVerdict::valid(SubmissionStatus::Won, 100),
        SubmissionStatus::Lost => SubmissionVerdict::valid(SubmissionStatus::Lost, 0),
    }
}

// ---------------------------------------------------------------------------
// queens: solution {queens: [row,col][]}; puzzleData {size, regions};
// submission {finalGrid: boolean[][]}
// ---------------------------------------------------------------------------

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct QueensSubmission {
    final_grid: Vec<Vec<bool>>,
}

pub(super) fn queens(
    puzzle_data: &Value,
    solution: &Value,
    env: &SubmissionEnvelope,
) -> SubmissionVerdict {
    use crate::capabilities::puzzle_play::domain::queens_conflict;
    let Ok(sub) = serde_json::from_value::<QueensSubmission>(env.data.clone()) else {
        return SubmissionVerdict::invalid("Missing final grid data");
    };
    let size = puzzle_data
        .get("size")
        .and_then(Value::as_u64)
        .or_else(|| solution.get("size").and_then(Value::as_u64))
        .unwrap_or(0) as usize;
    if size == 0 {
        return SubmissionVerdict::invalid("Missing queens size");
    }
    let regions = puzzle_data
        .get("regions")
        .and_then(Value::as_array)
        .map(|rows| {
            rows.iter()
                .map(|row| {
                    row.as_array()
                        .map(|cells| {
                            cells
                                .iter()
                                .filter_map(Value::as_i64)
                                .map(|v| v as i32)
                                .collect()
                        })
                        .unwrap_or_default()
                })
                .collect::<Vec<Vec<i32>>>()
        });
    let Some(regions) = regions else {
        return SubmissionVerdict::invalid("Missing queens regions");
    };
    let claimed = match env.status {
        SubmissionStatus::Won => queens_conflict::SubmissionStatus::Won,
        SubmissionStatus::Lost => queens_conflict::SubmissionStatus::Lost,
    };
    let result = queens_conflict::validate_and_score(
        Some(&sub.final_grid),
        &regions,
        size,
        env.time_spent_ms,
        claimed,
    );
    match result {
        queens_conflict::GameResult::Invalid { error } => SubmissionVerdict::invalid(error),
        queens_conflict::GameResult::Valid { status, score } => SubmissionVerdict::valid(
            match status {
                queens_conflict::SubmissionStatus::Won => SubmissionStatus::Won,
                queens_conflict::SubmissionStatus::Lost => SubmissionStatus::Lost,
            },
            score,
        ),
    }
}

// ---------------------------------------------------------------------------
// tango: solution {grid: ('sun'|'moon')[][]}; submission {grid: ('sun'|'moon'|null)[][]}
// ---------------------------------------------------------------------------

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct TangoSubmission {
    grid: Vec<Vec<Option<String>>>,
}

pub(super) fn tango(
    _puzzle_data: &Value,
    solution: &Value,
    env: &SubmissionEnvelope,
) -> SubmissionVerdict {
    use crate::capabilities::puzzle_play::domain::tango::{self, CellValue};
    let Ok(sub) = serde_json::from_value::<TangoSubmission>(env.data.clone()) else {
        return SubmissionVerdict::invalid("Missing grid data");
    };
    let Some(grid) = solution.get("grid").and_then(Value::as_array) else {
        return SubmissionVerdict::invalid("Missing tango solution grid");
    };
    let parse_cell = |v: Option<&str>| match v {
        Some("sun") => CellValue::Sun,
        Some("moon") => CellValue::Moon,
        _ => CellValue::Empty,
    };
    let solution_grid: Vec<Vec<CellValue>> = grid
        .iter()
        .map(|row| {
            row.as_array()
                .map(|cells| cells.iter().map(|c| parse_cell(c.as_str())).collect())
                .unwrap_or_default()
        })
        .collect();
    let submitted_grid: Vec<Vec<CellValue>> = sub
        .grid
        .iter()
        .map(|row| row.iter().map(|c| parse_cell(c.as_deref())).collect())
        .collect();
    let result = tango::validate_and_score(
        Some(&submitted_grid),
        Some(&solution_grid),
        env.time_spent_ms,
        match env.status {
            SubmissionStatus::Won => tango::SubmissionStatus::Won,
            SubmissionStatus::Lost => tango::SubmissionStatus::Lost,
        },
    );
    match result {
        tango::GameResult::Invalid { error } => SubmissionVerdict::invalid(error),
        tango::GameResult::Valid { status, score } => SubmissionVerdict::valid(
            match status {
                tango::SubmissionStatus::Won => SubmissionStatus::Won,
                tango::SubmissionStatus::Lost => SubmissionStatus::Lost,
            },
            score,
        ),
    }
}
