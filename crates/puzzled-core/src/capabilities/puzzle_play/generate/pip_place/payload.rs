use serde_json::{json, Value};

use crate::capabilities::puzzle_play::domain::random::SeededRandom;

use super::{
    constraints::assign_constraints, regions::generate_regions, tiling::generate_tiles, Cell,
};

const DAILY_MAX_PIP: i64 = 3;
const DAILY_ROWS: usize = 4;
const DAILY_COLS: usize = 5;

fn cell_json(cell: Cell) -> Value {
    json!({ "row": cell.row, "col": cell.col })
}

/// `(puzzle_data, solution)` for a seed. Difficulty is not used by this game.
pub fn generate(seed: i64, _difficulty: Option<&str>) -> Result<(Value, Value), String> {
    let (rows, cols, max_pip) = (DAILY_ROWS, DAILY_COLS, DAILY_MAX_PIP);
    let mut random = SeededRandom::new(seed);
    let tiles = generate_tiles(rows, cols, max_pip, &mut random)?;
    let region_of = generate_regions(rows, cols, &mut random);
    let regions = assign_constraints(&region_of, &tiles, &mut random);

    let puzzle_data = json!({
        "maxPip": max_pip,
        "rows": rows,
        "cols": cols,
        "regionOf": region_of,
        "regions": regions
            .iter()
            .map(|region| json!({ "id": region.id, "kind": region.kind, "value": region.value }))
            .collect::<Vec<_>>(),
    });
    let solution = json!({
        "tiles": tiles
            .iter()
            .map(|tile| json!({
                "a": cell_json(tile.a),
                "b": cell_json(tile.b),
                "pa": tile.pa,
                "pb": tile.pb,
            }))
            .collect::<Vec<_>>(),
    });
    Ok((puzzle_data, solution))
}

/// The validator grades `{ tiles }`, the same shape as the solution.
#[must_use]
pub fn solution_submission(solution: &Value) -> Value {
    json!({ "tiles": solution.get("tiles").cloned().unwrap_or(Value::Null) })
}
