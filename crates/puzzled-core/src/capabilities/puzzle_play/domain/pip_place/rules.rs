use super::types::{Cell, Puzzle, Region, RegionKind, Tile};

fn is_orthogonal_neighbor(a: Cell, b: Cell) -> bool {
    a.row.abs_diff(b.row) + a.col.abs_diff(b.col) == 1
}

fn in_bounds(cell: Cell, rows: i32, cols: i32) -> bool {
    cell.row >= 0 && cell.col >= 0 && cell.row < rows && cell.col < cols
}

fn is_int_pip(value: i32, max_pip: i32) -> bool {
    value >= 0 && value <= max_pip
}

fn sorted_pair(a: i32, b: i32) -> (i32, i32) {
    if a <= b {
        (a, b)
    } else {
        (b, a)
    }
}

fn double_set(max_pip: i32) -> Vec<(i32, i32)> {
    let mut out = Vec::new();
    for a in 0..=max_pip {
        for b in a..=max_pip {
            out.push((a, b));
        }
    }
    out
}

fn region_holds(region: Region, pips: &[i32]) -> bool {
    match region.kind {
        RegionKind::Free => true,
        RegionKind::Sum => {
            let Some(value) = region.value else {
                return false;
            };
            pips.iter().sum::<i32>() == value
        }
        RegionKind::Equal => {
            let Some(first) = pips.first() else {
                return false;
            };
            if !pips.iter().all(|pip| pip == first) {
                return false;
            }
            if let Some(value) = region.value {
                if value != *first {
                    return false;
                }
            }
            true
        }
        RegionKind::Unequal => {
            let mut seen = pips.to_vec();
            seen.sort_unstable();
            seen.dedup();
            seen.len() == pips.len()
        }
    }
}

/// Whether `tiles` is any covering that uses the complete double-n set
/// and satisfies every region constraint.
#[must_use]
pub fn is_solved(tiles: &[Tile], puzzle: &Puzzle) -> bool {
    let Puzzle {
        max_pip,
        rows,
        cols,
        region_of,
        regions,
    } = puzzle;
    if *max_pip < 0 || *rows <= 0 || *cols <= 0 {
        return false;
    }
    if region_of.len() != *rows as usize {
        return false;
    }
    for line in region_of {
        if line.len() != *cols as usize {
            return false;
        }
    }

    let expected = double_set(*max_pip);
    if tiles.len() != expected.len() {
        return false;
    }
    let Some(cell_count) = rows.checked_mul(*cols) else {
        return false;
    };
    if cell_count as usize != expected.len() * 2 {
        return false;
    }

    let mut grid: Vec<Vec<Option<i32>>> = vec![vec![None; *cols as usize]; *rows as usize];
    let mut actual_pairs: Vec<(i32, i32)> = Vec::with_capacity(tiles.len());
    for tile in tiles {
        if !in_bounds(tile.a, *rows, *cols) || !in_bounds(tile.b, *rows, *cols) {
            return false;
        }
        if !is_orthogonal_neighbor(tile.a, tile.b) {
            return false;
        }
        if !is_int_pip(tile.pa, *max_pip) || !is_int_pip(tile.pb, *max_pip) {
            return false;
        }
        let ar = tile.a.row as usize;
        let ac = tile.a.col as usize;
        let br = tile.b.row as usize;
        let bc = tile.b.col as usize;
        if grid[ar][ac].is_some() || grid[br][bc].is_some() {
            return false;
        }
        grid[ar][ac] = Some(tile.pa);
        grid[br][bc] = Some(tile.pb);
        actual_pairs.push(sorted_pair(tile.pa, tile.pb));
    }

    for line in &grid {
        if line.iter().any(Option::is_none) {
            return false;
        }
    }

    let mut expected_pairs: Vec<(i32, i32)> = expected;
    expected_pairs.sort_unstable();
    actual_pairs.sort_unstable();
    if expected_pairs != actual_pairs {
        return false;
    }

    let mut region_ids = std::collections::BTreeSet::new();
    for region in regions {
        if !region_ids.insert(region.id) {
            return false;
        }
    }

    for line in region_of {
        for id in line {
            if !region_ids.contains(id) {
                return false;
            }
        }
    }

    for region in regions {
        let mut pips = Vec::new();
        for (r, line) in region_of.iter().enumerate() {
            for (c, id) in line.iter().enumerate() {
                if *id != region.id {
                    continue;
                }
                let Some(pip) = grid[r][c] else {
                    return false;
                };
                pips.push(pip);
            }
        }
        if pips.is_empty() {
            return false;
        }
        if !region_holds(*region, &pips) {
            return false;
        }
    }

    true
}
