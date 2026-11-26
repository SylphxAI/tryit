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
