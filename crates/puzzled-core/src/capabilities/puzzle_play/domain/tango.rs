//! Pure tango (binary sun/moon) is_solved + score — mirrors
//! `apps/puzzled/src/games/tango/types.ts#isSolved|getConflicts` and
//! `config.ts#validateAndScore`.
//! PORTFOLIO residual pure deepen. NO authority_rust / ts_deleted.

#![allow(clippy::needless_range_loop)]

/// Base score for a win before time penalty.
pub const BASE_WIN_SCORE: u32 = 500;
/// Floor score for a win.
pub const MIN_WIN_SCORE: u32 = 100;
/// Max consecutive same symbols allowed.
pub const MAX_CONSECUTIVE: usize = 2;

/// Cell value: sun, moon, or empty.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash)]
pub enum CellValue {
    Sun,
    Moon,
    Empty,
}

impl CellValue {
    #[must_use]
    pub fn is_filled(self) -> bool {
        matches!(self, Self::Sun | Self::Moon)
    }
}

fn cell_is_filled(v: &CellValue) -> bool {
    v.is_filled()
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum SubmissionStatus {
    Won,
    Lost,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum GameResult {
    Invalid {
        error: String,
    },
    Valid {
        status: SubmissionStatus,
        score: u32,
    },
}

impl GameResult {
    #[must_use]
    pub fn is_valid(&self) -> bool {
        matches!(self, Self::Valid { .. })
    }
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

/// Whether the binary puzzle is fully solved under tango rules.
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

/// Score: `max(100, 500 - floor(seconds/2))`.
#[must_use]
pub fn tango_score(time_spent_ms: u64) -> u32 {
    let seconds = time_spent_ms / 1000;
    let time_penalty = (seconds / 2) as u32;
    BASE_WIN_SCORE
        .saturating_sub(time_penalty)
        .max(MIN_WIN_SCORE)
}

/// Validate claimed win/loss; optionally require exact solution match on win.
#[must_use]
pub fn validate_and_score(
    submitted: Option<&[Vec<CellValue>]>,
    solution: Option<&[Vec<CellValue>]>,
    time_spent_ms: u64,
    claimed: SubmissionStatus,
) -> GameResult {
    let Some(grid) = submitted else {
        return GameResult::Invalid {
            error: "Missing grid data".into(),
        };
    };

    let solved = is_solved(grid);

    if claimed == SubmissionStatus::Won && !solved {
        return GameResult::Invalid {
            error: "Puzzle not correctly solved".into(),
        };
    }

    if claimed == SubmissionStatus::Won {
        if let Some(sol) = solution {
            if grid.len() != sol.len() {
                return GameResult::Invalid {
                    error: "Solution mismatch".into(),
                };
            }
            for r in 0..grid.len() {
                if grid[r].len() != sol[r].len() {
                    return GameResult::Invalid {
                        error: "Solution mismatch".into(),
                    };
                }
                for c in 0..grid[r].len() {
                    if grid[r][c] != sol[r][c] {
                        return GameResult::Invalid {
                            error: "Solution mismatch".into(),
                        };
                    }
                }
            }
        }
    }

    if claimed == SubmissionStatus::Lost && solved {
        return GameResult::Invalid {
            error: "Invalid loss claim - puzzle is solved".into(),
        };
    }

    if !solved {
        return GameResult::Valid {
            status: SubmissionStatus::Lost,
            score: 0,
        };
    }

    GameResult::Valid {
        status: SubmissionStatus::Won,
        score: tango_score(time_spent_ms),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn s() -> CellValue {
        CellValue::Sun
    }
    fn m() -> CellValue {
        CellValue::Moon
    }
    fn e() -> CellValue {
        CellValue::Empty
    }

    /// Known-valid 4×4 tango grid.
    fn valid_4() -> Vec<Vec<CellValue>> {
        vec![
            vec![s(), s(), m(), m()],
            vec![m(), m(), s(), s()],
            vec![s(), m(), s(), m()],
            vec![m(), s(), m(), s()],
        ]
    }

    #[test]
    fn solved_valid_4() {
        assert!(is_solved(&valid_4()));
    }

    #[test]
    fn empty_not_solved() {
        let g = vec![vec![e(); 4]; 4];
        assert!(!is_solved(&g));
    }

    #[test]
    fn consecutive_violation_detected() {
        let mut g = valid_4();
        // force SSS on row 0
        g[0] = vec![s(), s(), s(), m()];
        assert!(has_consecutive_violation(&g, 0, 1));
        assert!(!is_solved(&g));
    }

    fn board(rows: [&str; 6]) -> Vec<Vec<CellValue>> {
        rows.iter()
            .map(|row| {
                row.bytes()
                    .map(|v| match v {
                        b'S' => s(),
                        b'M' => m(),
                        b'.' => e(),
                        _ => unreachable!(),
                    })
                    .collect()
            })
            .collect()
    }

    #[test]
    fn duplicate_rows_and_columns_on_reported_six_by_six() {
        let grid = board(["SMSMSM", "MSMSMS", "SMSMSM", "MSMSMS", "MSMSMS", "SMSMSM"]);
        let details = get_conflict_details(&grid);
        assert_eq!(details.duplicate_rows, vec![vec![1, 3, 6], vec![2, 4, 5]]);
        assert_eq!(
            details.duplicate_columns,
            vec![vec![1, 3, 5], vec![2, 4, 6]]
        );
        assert!(!details.consecutive && !details.imbalance);
        let mut cells = get_conflicts(&grid);
        assert_eq!(cells, details.cells);
        cells.sort_unstable();
        assert_eq!(
            cells,
            (0..6)
                .flat_map(|r| (0..6).map(move |c| (r, c)))
                .collect::<Vec<_>>()
        );
        assert!(!is_solved(&grid));
    }

    #[test]
    fn duplicates_light_up_only_when_both_lines_are_complete() {
        let mut grid = board(["SMSMSM", "......", "SMSMSM", "MSMSM.", "MSMSM.", "......"]);
        let details = get_conflict_details(&grid);
        assert_eq!(details.duplicate_rows, vec![vec![1, 3]]);
        assert!(details.duplicate_columns.is_empty());
        assert_eq!(
            details.cells,
            [0, 2]
                .into_iter()
                .flat_map(|r| (0..6).map(move |c| (r, c)))
                .collect::<Vec<_>>()
        );
        let transposed: Vec<Vec<_>> = (0..6)
            .map(|c| grid.iter().map(|r| r[c]).collect())
            .collect();
        let details = get_conflict_details(&transposed);
        assert!(details.duplicate_rows.is_empty());
        assert_eq!(details.duplicate_columns, vec![vec![1, 3]]);
        assert_eq!(
            details.cells,
            [0, 2]
                .into_iter()
                .flat_map(|c| (0..6).map(move |r| (r, c)))
                .collect::<Vec<_>>()
        );
        grid[2][5] = e();
        assert_eq!(get_conflict_details(&grid), ConflictDetails::default());
    }

    #[test]
    fn unique_six_by_six_remains_solved_and_conflict_free() {
        let grid = board(["SSMSMM", "SSMMSM", "MMSSMS", "SMSSMM", "MSMMSS", "MMSMSS"]);
        assert_eq!(get_conflict_details(&grid), ConflictDetails::default());
        assert!(get_conflicts(&grid).is_empty());
        assert!(is_solved(&grid));
    }

    #[test]
    fn consecutive_and_imbalance_keep_their_original_conflict_cells() {
        let consecutive = board(["SSS...", "......", "......", "......", "......", "......"]);
        assert_eq!(
            get_conflict_details(&consecutive),
            ConflictDetails {
                cells: vec![(0, 0), (0, 1), (0, 2)],
                consecutive: true,
                ..Default::default()
            }
        );
        let imbalance = board(["SSMSS.", "......", "......", "......", "......", "......"]);
        assert_eq!(
            get_conflict_details(&imbalance),
            ConflictDetails {
                cells: vec![(0, 0), (0, 1), (0, 2), (0, 3), (0, 4)],
                imbalance: true,
                ..Default::default()
            }
        );
    }

    #[test]
    fn score_table_matches_ts() {
        assert_eq!(tango_score(0), 500);
        assert_eq!(tango_score(100_000), 450); // 100s → 50
        assert_eq!(tango_score(200_000), 400);
        assert_eq!(tango_score(2_000_000), 100);
        assert_eq!(tango_score(99_000), 451); // floor(99/2)=49
    }

    #[test]
    fn validate_win_and_loss() {
        let g = valid_4();
        let win = validate_and_score(Some(&g), Some(&g), 0, SubmissionStatus::Won);
        assert_eq!(
            win,
            GameResult::Valid {
                status: SubmissionStatus::Won,
                score: 500
            }
        );
        let mut bad = g.clone();
        bad[0][0] = m();
        let false_win = validate_and_score(Some(&bad), Some(&g), 0, SubmissionStatus::Won);
        assert!(!false_win.is_valid());
        let lost = validate_and_score(Some(&bad), Some(&g), 60_000, SubmissionStatus::Lost);
        assert_eq!(
            lost,
            GameResult::Valid {
                status: SubmissionStatus::Lost,
                score: 0
            }
        );
        let false_loss = validate_and_score(Some(&g), Some(&g), 0, SubmissionStatus::Lost);
        assert!(!false_loss.is_valid());
        let missing = validate_and_score(None, Some(&g), 0, SubmissionStatus::Won);
        assert!(!missing.is_valid());
    }
}
