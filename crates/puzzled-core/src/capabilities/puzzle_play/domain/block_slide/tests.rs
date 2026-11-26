use super::*;

fn simple_puzzle() -> BlockSlidePuzzle {
    BlockSlidePuzzle {
        grid_width: 4,
        grid_height: 5,
        exit_x: 1,
        exit_y: 3,
        min_moves: 0,
        blocks: vec![
            Block {
                id: "target".into(),
                x: 1,
                y: 1,
                width: 2,
                height: 2,
                is_target: true,
            },
            Block {
                id: "a".into(),
                x: 0,
                y: 0,
                width: 1,
                height: 2,
                is_target: false,
            },
            Block {
                id: "b".into(),
                x: 3,
                y: 0,
                width: 1,
                height: 2,
                is_target: false,
            },
        ],
    }
}

#[test]
fn solve_simple_puzzle() {
    let puzzle = simple_puzzle();
    let result = solve_puzzle(&puzzle, DEFAULT_MAX_MOVES);
    assert!(result.solvable);
    assert!(result.min_moves > 0);
    assert!(result.min_moves < 20);
}

#[test]
fn detect_unsolvable() {
    let puzzle = BlockSlidePuzzle {
        grid_width: 4,
        grid_height: 5,
        exit_x: 1,
        exit_y: 3,
        min_moves: 0,
        blocks: vec![
            Block {
                id: "target".into(),
                x: 1,
                y: 0,
                width: 2,
                height: 2,
                is_target: true,
            },
            Block {
                id: "a".into(),
                x: 0,
                y: 0,
                width: 1,
                height: 5,
                is_target: false,
            },
            Block {
                id: "b".into(),
                x: 3,
                y: 0,
                width: 1,
                height: 5,
                is_target: false,
            },
            Block {
                id: "c".into(),
                x: 1,
                y: 2,
                width: 2,
                height: 3,
                is_target: false,
            },
        ],
    };
    let result = solve_puzzle(&puzzle, 50);
    assert!(!result.solvable);
    assert_eq!(result.min_moves, -1);
}

#[test]
fn configuration_valid_and_overlap() {
    let valid = simple_puzzle();
    assert!(is_valid_configuration(&valid));

    let mut invalid = simple_puzzle();
    invalid.blocks[0].x = 0;
    invalid.blocks[0].y = 0;
    invalid.blocks[1].x = 1;
    invalid.blocks[1].y = 0;
    assert!(!is_valid_configuration(&invalid));
}

#[test]
fn can_move_and_win() {
    let puzzle = simple_puzzle();
    assert!(can_move(
        &puzzle.blocks,
        "target",
        Direction::Down,
        puzzle.grid_width,
        puzzle.grid_height
    ));
    let moved = move_block(&puzzle.blocks, "target", Direction::Down);
    let target_y = moved.iter().find(|b| b.is_target).map(|b| b.y);
    assert_eq!(target_y, Some(2));
    assert!(!is_win(&puzzle.blocks, puzzle.exit_x, puzzle.exit_y));
}

#[test]
fn score_table_matches_ts() {
    // optimal under 60s → 550
    assert_eq!(block_slide_score(10, 10, 30_000), 550);
    // optimal over 60s → 500
    assert_eq!(block_slide_score(10, 10, 120_000), 500);
    // 5 extra over 60s → 475
    assert_eq!(block_slide_score(10, 15, 120_000), 475);
    // 5 extra under 60s → 525
    assert_eq!(block_slide_score(10, 15, 30_000), 525);
    // huge extra floors at 100
    assert_eq!(block_slide_score(1, 200, 120_000), 100);
}

#[test]
fn validate_win_and_loss() {
    let r = validate_and_score(10, Some(10), 30_000, SubmissionStatus::Won);
    assert_eq!(
        r,
        GameResult::Valid {
            status: SubmissionStatus::Won,
            score: 550
        }
    );
    let lost = validate_and_score(10, None, 0, SubmissionStatus::Lost);
    assert_eq!(
        lost,
        GameResult::Valid {
            status: SubmissionStatus::Lost,
            score: 0
        }
    );
    let impossible = validate_and_score(10, Some(5), 0, SubmissionStatus::Won);
    assert!(!impossible.is_valid());
    let missing = validate_and_score(10, None, 0, SubmissionStatus::Won);
    assert!(!missing.is_valid());
}
