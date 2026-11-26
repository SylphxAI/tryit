use super::types::CellValue;

/// Max consecutive same symbols allowed.
pub const MAX_CONSECUTIVE: usize = 2;

fn cell_is_filled(v: &CellValue) -> bool {
    v.is_filled()
}

/// Whether three-in-a-row (or more) exists around (row, col).
#[must_use]
pub fn has_consecutive_violation(grid: &[Vec<CellValue>], row: usize, col: usize) -> bool {
    let value = grid.get(row).and_then(|r| r.get(col)).copied();
    let Some(value) = value.filter(cell_is_filled) else {
        return false;
    };
    let size = grid.len();

    // horizontal: three same centered or spanning this cell
    if col >= 2 && grid[row][col - 1] == value && grid[row][col - 2] == value {
        return true;
    }
    if col >= 1 && col + 1 < size && grid[row][col - 1] == value && grid[row][col + 1] == value {
        return true;
    }
    if col + 2 < size && grid[row][col + 1] == value && grid[row][col + 2] == value {
        return true;
    }

    // vertical
    if row >= 2 && grid[row - 1][col] == value && grid[row - 2][col] == value {
        return true;
    }
    if row >= 1 && row + 1 < size && grid[row - 1][col] == value && grid[row + 1][col] == value {
        return true;
    }
    if row + 2 < size && grid[row + 1][col] == value && grid[row + 2][col] == value {
        return true;
    }

    false
}

/// Cell coordinates are zero-based; duplicate groups are one-based for display.
#[derive(Debug, Default, PartialEq, Eq)]
pub struct ConflictDetails {
    pub cells: Vec<(usize, usize)>,
    pub consecutive: bool,
    pub imbalance: bool,
    pub duplicate_rows: Vec<Vec<usize>>,
    pub duplicate_columns: Vec<Vec<usize>>,
}

fn duplicate_groups(lines: &[Vec<CellValue>]) -> Vec<Vec<usize>> {
    let mut groups = std::collections::HashMap::<&[CellValue], Vec<usize>>::new();
    for (index, line) in lines.iter().enumerate() {
        if line.iter().all(cell_is_filled) {
            groups.entry(line).or_default().push(index + 1);
        }
    }
    let mut duplicates: Vec<_> = groups
        .into_values()
        .filter(|group| group.len() > 1)
        .collect();
    duplicates.sort_unstable_by_key(|group| group[0]);
    duplicates
}

#[allow(clippy::needless_range_loop)]
#[must_use]
pub fn get_conflict_details(grid: &[Vec<CellValue>]) -> ConflictDetails {
    let size = grid.len();
    let half = size / 2;
    let columns: Vec<Vec<_>> = (0..size)
        .map(|c| grid.iter().map(|row| row[c]).collect())
        .collect();
    let mut details = ConflictDetails::default();
    let mut seen = vec![false; size * size];
    let mut mark = |r, c| {
        if !std::mem::replace(&mut seen[r * size + c], true) {
            details.cells.push((r, c));
        }
    };

    for r in 0..size {
        for c in 0..size {
            if has_consecutive_violation(grid, r, c) {
                details.consecutive = true;
                mark(r, c);
            }
        }
    }

    for (lines, by_row) in [(grid, true), (columns.as_slice(), false)] {
        for (index, line) in lines.iter().enumerate() {
            let suns = line.iter().filter(|&&v| v == CellValue::Sun).count();
            let moons = line.iter().filter(|&&v| v == CellValue::Moon).count();
            if suns <= half && moons <= half {
                continue;
            }
            details.imbalance = true;
            for offset in 0..size {
                if line[offset].is_filled() {
                    if by_row {
                        mark(index, offset);
                    } else {
                        mark(offset, index);
                    }
                }
            }
        }
    }

    details.duplicate_rows = duplicate_groups(grid);
    details.duplicate_columns = duplicate_groups(&columns);
    for &row in details.duplicate_rows.iter().flatten() {
        for col in 0..size {
            mark(row - 1, col);
        }
    }
    for &col in details.duplicate_columns.iter().flatten() {
        for row in 0..size {
            mark(row, col - 1);
        }
    }
    details
}

/// Collect conflict cells for all three rules.
#[must_use]
pub fn get_conflicts(grid: &[Vec<CellValue>]) -> Vec<(usize, usize)> {
    get_conflict_details(grid).cells
}
