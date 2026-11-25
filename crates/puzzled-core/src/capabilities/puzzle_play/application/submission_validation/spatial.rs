//! Sliding-block, path, and tiling game adapters.

use serde::Deserialize;
use serde_json::Value;

use super::{SubmissionEnvelope, SubmissionVerdict};
use crate::capabilities::puzzle_play::domain::scoring::SubmissionStatus;

// ---------------------------------------------------------------------------
// block-slide: solution {minMoves}; submission {moveCount: number}
// ---------------------------------------------------------------------------

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct BlockSlideSubmission {
    move_count: u32,
}

pub(super) fn block_slide(
    _puzzle_data: &Value,
    solution: &Value,
    env: &SubmissionEnvelope,
) -> SubmissionVerdict {
    use crate::capabilities::puzzle_play::domain::block_slide;
    let Ok(sub) = serde_json::from_value::<BlockSlideSubmission>(env.data.clone()) else {
        return SubmissionVerdict::invalid("Missing moveCount data");
    };
    let Some(min_moves) = solution.get("minMoves").and_then(Value::as_u64) else {
        return SubmissionVerdict::invalid("Missing minMoves solution");
    };
    let result = block_slide::validate_and_score(
        min_moves as u32,
        Some(sub.move_count),
        env.time_spent_ms,
        match env.status {
            SubmissionStatus::Won => block_slide::SubmissionStatus::Won,
            SubmissionStatus::Lost => block_slide::SubmissionStatus::Lost,
        },
    );
    match result {
        block_slide::GameResult::Invalid { error } => SubmissionVerdict::invalid(error),
        block_slide::GameResult::Valid { status, score } => SubmissionVerdict::valid(
            match status {
                block_slide::SubmissionStatus::Won => SubmissionStatus::Won,
                block_slide::SubmissionStatus::Lost => SubmissionStatus::Lost,
            },
            score,
        ),
    }
}

// ---------------------------------------------------------------------------
// number-path (Path): puzzleData {clues}; submission {path: {row,col}[]}
// Win is any Hamiltonian path that respects clues; stored seed path is ignored.
// ---------------------------------------------------------------------------

#[derive(Debug, Deserialize)]
struct NumberPathCell {
    row: i32,
    col: i32,
}

#[derive(Debug, Deserialize)]
struct NumberPathSubmission {
    path: Option<Vec<NumberPathCell>>,
}

fn parse_number_path_clues(puzzle_data: &Value) -> Option<Vec<Vec<Option<u32>>>> {
    let clues = puzzle_data.get("clues")?.as_array()?;
    let mut grid = Vec::with_capacity(clues.len());
    for row in clues {
        let cells = row.as_array()?;
        let mut line = Vec::with_capacity(cells.len());
        for cell in cells {
            if cell.is_null() {
                line.push(None);
            } else {
                line.push(Some(cell.as_u64()? as u32));
            }
        }
        grid.push(line);
    }
    Some(grid)
}

pub(super) fn number_path(
    puzzle_data: &Value,
    _solution: &Value,
    env: &SubmissionEnvelope,
) -> SubmissionVerdict {
    use crate::capabilities::puzzle_play::domain::number_path::{self, Cell};
    let Ok(sub) = serde_json::from_value::<NumberPathSubmission>(env.data.clone()) else {
        return SubmissionVerdict::invalid("Missing path");
    };
    let Some(path) = sub.path else {
        return SubmissionVerdict::invalid("Missing path");
    };
    let Some(clues) = parse_number_path_clues(puzzle_data) else {
        return SubmissionVerdict::invalid("Missing clues");
    };
    let cells: Vec<Cell> = path
        .iter()
        .map(|cell| Cell {
            row: cell.row,
            col: cell.col,
        })
        .collect();
    let claimed = match env.status {
        SubmissionStatus::Won => number_path::SubmissionStatus::Won,
        SubmissionStatus::Lost => number_path::SubmissionStatus::Lost,
    };
    let result = number_path::validate_and_score(Some(&cells), &clues, env.time_spent_ms, claimed);
    match result {
        number_path::GameResult::Invalid { error } => SubmissionVerdict::invalid(error),
        number_path::GameResult::Valid { status, score } => SubmissionVerdict::valid(
            match status {
                number_path::SubmissionStatus::Won => SubmissionStatus::Won,
                number_path::SubmissionStatus::Lost => SubmissionStatus::Lost,
            },
            score,
        ),
    }
}

// ---------------------------------------------------------------------------
// pip-place (Spots): puzzleData {maxPip,rows,cols,regionOf,regions};
// submission {tiles:[{a,b,pa,pb}]}.
// Win is any covering that satisfies regions; stored seed tiles are ignored.
// ---------------------------------------------------------------------------

#[derive(Debug, Deserialize)]
struct PipPlaceCellJson {
    row: i32,
    col: i32,
}

#[derive(Debug, Deserialize)]
struct PipPlaceTileJson {
    a: PipPlaceCellJson,
    b: PipPlaceCellJson,
    pa: i32,
    pb: i32,
}

#[derive(Debug, Deserialize)]
struct PipPlaceSubmission {
    tiles: Option<Vec<PipPlaceTileJson>>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct PipPlaceRegionJson {
    id: i32,
    kind: String,
    #[serde(default)]
    value: Option<i32>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct PipPlacePuzzleJson {
    max_pip: i32,
    rows: i32,
    cols: i32,
    region_of: Vec<Vec<i32>>,
    regions: Vec<PipPlaceRegionJson>,
}

fn parse_pip_place_puzzle(
    puzzle_data: &Value,
) -> Option<crate::capabilities::puzzle_play::domain::pip_place::Puzzle> {
    use crate::capabilities::puzzle_play::domain::pip_place::{Puzzle, Region, RegionKind};
    let parsed = serde_json::from_value::<PipPlacePuzzleJson>(puzzle_data.clone()).ok()?;
    let mut regions = Vec::with_capacity(parsed.regions.len());
    for region in parsed.regions {
        let kind = match region.kind.as_str() {
            "sum" => RegionKind::Sum,
            "equal" => RegionKind::Equal,
            "unequal" => RegionKind::Unequal,
            "free" => RegionKind::Free,
            _ => return None,
        };
        regions.push(Region {
            id: region.id,
            kind,
            value: region.value,
        });
    }
    Some(Puzzle {
        max_pip: parsed.max_pip,
        rows: parsed.rows,
        cols: parsed.cols,
        region_of: parsed.region_of,
        regions,
    })
}

pub(super) fn pip_place(
    puzzle_data: &Value,
    _solution: &Value,
    env: &SubmissionEnvelope,
) -> SubmissionVerdict {
    use crate::capabilities::puzzle_play::domain::pip_place::{self, Cell, Tile};
    let Ok(sub) = serde_json::from_value::<PipPlaceSubmission>(env.data.clone()) else {
        return SubmissionVerdict::invalid("Missing tiles");
    };
    let Some(tiles_json) = sub.tiles else {
        return SubmissionVerdict::invalid("Missing tiles");
    };
    let Some(puzzle) = parse_pip_place_puzzle(puzzle_data) else {
        return SubmissionVerdict::invalid("Missing puzzle data");
    };
    let tiles: Vec<Tile> = tiles_json
        .iter()
        .map(|tile| Tile {
            a: Cell {
                row: tile.a.row,
                col: tile.a.col,
            },
            b: Cell {
                row: tile.b.row,
                col: tile.b.col,
            },
            pa: tile.pa,
            pb: tile.pb,
        })
        .collect();
    let claimed = match env.status {
        SubmissionStatus::Won => pip_place::SubmissionStatus::Won,
        SubmissionStatus::Lost => pip_place::SubmissionStatus::Lost,
    };
    let result = pip_place::validate_and_score(Some(&tiles), &puzzle, env.time_spent_ms, claimed);
    match result {
        pip_place::GameResult::Invalid { error } => SubmissionVerdict::invalid(error),
        pip_place::GameResult::Valid { status, score } => SubmissionVerdict::valid(
            match status {
                pip_place::SubmissionStatus::Won => SubmissionStatus::Won,
                pip_place::SubmissionStatus::Lost => SubmissionStatus::Lost,
            },
            score,
        ),
    }
}
