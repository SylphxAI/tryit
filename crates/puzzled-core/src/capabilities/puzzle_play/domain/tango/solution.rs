use super::conflicts::get_conflicts;
use super::types::CellValue;

/// Whether the binary puzzle is fully solved under tango rules.
#[allow(clippy::needless_range_loop)]
#[must_use]
pub fn is_solved(grid: &[Vec<CellValue>]) -> bool {
    let size = grid.len();
    if size == 0 || !size.is_multiple_of(2) {
        return false;
    }
    let half = size / 2;

    for r in 0..size {
        if grid[r].len() != size {
            return false;
        }
        for c in 0..size {
            if !grid[r][c].is_filled() {
                return false;
            }
        }
    }

    if !get_conflicts(grid).is_empty() {
        return false;
    }

    for r in 0..size {
        let sun = grid[r].iter().filter(|&&v| v == CellValue::Sun).count();
        let moon = grid[r].iter().filter(|&&v| v == CellValue::Moon).count();
        if sun != half || moon != half {
            return false;
        }
    }
    for c in 0..size {
        let sun = (0..size).filter(|&r| grid[r][c] == CellValue::Sun).count();
        let moon = (0..size).filter(|&r| grid[r][c] == CellValue::Moon).count();
        if sun != half || moon != half {
            return false;
        }
    }

    // row uniqueness
    let mut row_strings = std::collections::HashSet::new();
    for r in 0..size {
        let key: String = grid[r]
            .iter()
            .map(|v| match v {
                CellValue::Sun => 'S',
                CellValue::Moon => 'M',
                CellValue::Empty => '.',
            })
            .collect();
        if !row_strings.insert(key) {
            return false;
        }
    }

    // column uniqueness
    let mut col_strings = std::collections::HashSet::new();
    for c in 0..size {
        let key: String = (0..size)
            .map(|r| match grid[r][c] {
                CellValue::Sun => 'S',
                CellValue::Moon => 'M',
                CellValue::Empty => '.',
            })
            .collect();
        if !col_strings.insert(key) {
            return false;
        }
    }

    true
}
