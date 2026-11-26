use super::*;
fn cell(row: i32, col: i32) -> Cell {
    Cell { row, col }
}
fn fixture_puzzle() -> Puzzle {
    Puzzle {
        max_pip: 1,
        rows: 2,
        cols: 3,
        region_of: vec![vec![1, 1, 0], vec![1, 1, 1]],
        regions: vec![
            Region {
                id: 0,
                kind: RegionKind::Sum,
                value: Some(0),
            },
            Region {
                id: 1,
                kind: RegionKind::Free,
                value: None,
            },
        ],
    }
}
fn tiles_a() -> Vec<Tile> {
    vec![
        Tile {
            a: cell(0, 0),
            b: cell(1, 0),
            pa: 0,
            pb: 0,
        },
        Tile {
            a: cell(0, 1),
            b: cell(1, 1),
            pa: 1,
            pb: 1,
        },
        Tile {
            a: cell(0, 2),
            b: cell(1, 2),
            pa: 0,
            pb: 1,
        },
    ]
}
fn tiles_b() -> Vec<Tile> {
    vec![
        Tile {
            a: cell(0, 0),
            b: cell(0, 1),
            pa: 0,
            pb: 0,
        },
        Tile {
            a: cell(1, 0),
            b: cell(1, 1),
            pa: 1,
            pb: 1,
        },
        Tile {
            a: cell(0, 2),
            b: cell(1, 2),
            pa: 0,
            pb: 1,
        },
    ]
}
#[test]
fn both_fixture_tilings_solve() {
    let puzzle = fixture_puzzle();
    assert!(is_solved(&tiles_a(), &puzzle));
    assert!(is_solved(&tiles_b(), &puzzle));
}
#[test]
fn incomplete_tiles_are_not_solved() {
    let puzzle = fixture_puzzle();
    assert!(!is_solved(&tiles_a()[..2], &puzzle));
}
#[test]
fn score_table_matches_ts() {
    assert_eq!(pip_place_score(0), 500);
    assert_eq!(pip_place_score(100_000), 450);
    assert_eq!(pip_place_score(200_000), 400);
    assert_eq!(pip_place_score(2_000_000), 100);
    assert_eq!(pip_place_score(99_000), 451);
}
#[test]
fn validate_alternate_tiling_and_claims() {
    let puzzle = fixture_puzzle();
    let a = tiles_a();
    let b = tiles_b();
    let win_b = validate_and_score(Some(&b), &puzzle, 0, SubmissionStatus::Won);
    assert_eq!(
        win_b,
        GameResult::Valid {
            status: SubmissionStatus::Won,
            score: 500
        }
    );
    let win_a = validate_and_score(Some(&a), &puzzle, 100_000, SubmissionStatus::Won);
    assert_eq!(
        win_a,
        GameResult::Valid {
            status: SubmissionStatus::Won,
            score: 450
        }
    );
    let incomplete = tiles_a()[..2].to_vec();
    let false_win = validate_and_score(Some(&incomplete), &puzzle, 0, SubmissionStatus::Won);
    assert!(!false_win.is_valid());
    let lost = validate_and_score(Some(&incomplete), &puzzle, 60_000, SubmissionStatus::Lost);
    assert_eq!(
        lost,
        GameResult::Valid {
            status: SubmissionStatus::Lost,
            score: 0
        }
    );
    let false_loss = validate_and_score(Some(&b), &puzzle, 0, SubmissionStatus::Lost);
    assert!(!false_loss.is_valid());
    let missing = validate_and_score(None, &puzzle, 0, SubmissionStatus::Won);
    assert!(!missing.is_valid());
    if let GameResult::Invalid { error } = missing {
        assert!(error.contains("Missing tiles"));
    }
}
