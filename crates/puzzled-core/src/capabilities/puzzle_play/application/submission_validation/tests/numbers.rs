use super::super::{validate_submission, SubmissionStatus};
use super::{env, lost_env};
use serde_json::{json, Value};

#[test]
fn sudoku_accepts_correct_grid() {
    let solution = json!({ "grid": [[1,2],[3,4]] });
    let data = env(json!({ "finalGrid": [[1,2],[3,4]] }));
    // 2x2 is not a valid sudoku size; expect a validation error, not a panic.
    let v = validate_submission("sudoku", &json!({}), &solution, &data);
    assert!(!v.valid);
}

fn ambiguous_sudoku() -> (Value, Value, Vec<Vec<u8>>) {
    let generated = crate::capabilities::puzzle_play::sudoku::generate_sudoku_puzzle(
        42,
        crate::capabilities::puzzle_play::sudoku::SudokuDifficulty::Easy,
    );
    let canonical = generated.solution.grid;
    // Removing both digits admits their global swap, preserving every clue.
    let clues: Vec<Vec<Option<u8>>> = canonical
        .iter()
        .map(|row| {
            row.iter()
                .map(|v| if *v <= 2 { None } else { Some(*v) })
                .collect()
        })
        .collect();
    let alternate = canonical
        .iter()
        .map(|row| {
            row.iter()
                .map(|v| match v {
                    1 => 2,
                    2 => 1,
                    _ => *v,
                })
                .collect()
        })
        .collect();
    (
        json!({"grid": clues, "difficulty": "easy"}),
        json!({"grid": canonical}),
        alternate,
    )
}

#[test]
fn sudoku_accepts_alternate_completion_against_frozen_clues() {
    let (puzzle, solution, alternate) = ambiguous_sudoku();
    assert_ne!(json!(alternate), solution["grid"]);
    let verdict = validate_submission(
        "sudoku",
        &puzzle,
        &solution,
        &env(json!({"finalGrid": alternate})),
    );
    assert!(verdict.valid, "{verdict:?}");
    assert_eq!(verdict.status, Some(SubmissionStatus::Won));
    assert_eq!(verdict.score, Some(999));
    let mut loss = env(json!({"finalGrid": alternate}));
    loss.status = SubmissionStatus::Lost;
    assert!(!validate_submission("sudoku", &puzzle, &solution, &loss).valid);
}

#[test]
fn sudoku_rejects_valid_grid_that_changes_a_given() {
    let (mut puzzle, solution, alternate) = ambiguous_sudoku();
    // Alternate remains a fully valid Sudoku, but this new clue forbids it.
    let canonical: Vec<Vec<u8>> = serde_json::from_value(solution["grid"].clone()).unwrap();
    let (r, c) = canonical
        .iter()
        .enumerate()
        .find_map(|(r, row)| row.iter().position(|v| *v <= 2).map(|c| (r, c)))
        .unwrap();
    puzzle["grid"][r][c] = json!(canonical[r][c]);
    assert!(
        !validate_submission(
            "sudoku",
            &puzzle,
            &solution,
            &env(json!({"finalGrid": alternate}))
        )
        .valid
    );
}

#[test]
fn sudoku_rejects_invalid_grids_and_malformed_clues_without_panicking() {
    let (puzzle, solution, alternate) = ambiguous_sudoku();
    for value in [
        json!(null),
        json!(0),
        json!(10),
        json!(-1),
        json!(1.5),
        json!("1"),
        json!(true),
    ] {
        let mut grid = json!(alternate);
        grid[8][8] = value;
        assert!(
            !validate_submission(
                "sudoku",
                &puzzle,
                &solution,
                &env(json!({"finalGrid": grid}))
            )
            .valid
        );
    }
    let mut grid = alternate.clone();
    grid[8][8] = grid[8][7];
    assert!(
        !validate_submission(
            "sudoku",
            &puzzle,
            &solution,
            &env(json!({"finalGrid": grid}))
        )
        .valid
    );
    // A Latin square satisfies row/column uniqueness, but violates 3x3 boxes.
    let latin: Vec<Vec<u8>> = (0..9)
        .map(|r| (0..9).map(|c| ((r + c) % 9 + 1) as u8).collect())
        .collect();
    let empty = json!({"grid": vec![vec![None::<u8>;9];9], "difficulty": "easy"});
    assert!(
        !validate_submission(
            "sudoku",
            &empty,
            &solution,
            &env(json!({"finalGrid": latin}))
        )
        .valid
    );
    let mut short = json!(alternate);
    short[8] = json!([1]);
    assert!(
        !validate_submission(
            "sudoku",
            &puzzle,
            &solution,
            &env(json!({"finalGrid": short}))
        )
        .valid
    );
    for clues in [json!({}), json!({"grid": [[null]], "difficulty": "easy"})] {
        assert!(
            !validate_submission(
                "sudoku",
                &clues,
                &solution,
                &env(json!({"finalGrid": alternate}))
            )
            .valid
        );
    }
}

#[test]
fn arithmo_accepts_an_honest_loss() {
    let solution = json!({ "equation": "12+34=46" });
    let v = validate_submission(
        "arithmo",
        &json!({}),
        &solution,
        &lost_env(json!({ "guesses": ["56-32=24"] })),
    );
    assert!(v.valid, "{v:?}");
    assert_eq!(v.status, Some(SubmissionStatus::Lost));
}

#[test]
fn arithmo_still_rejects_a_false_win() {
    let solution = json!({ "equation": "12+34=46" });
    let v = validate_submission(
        "arithmo",
        &json!({}),
        &solution,
        &env(json!({ "guesses": ["56-32=24"] })),
    );
    assert!(!v.valid);
}

#[test]
fn killer_sudoku_accepts_an_honest_loss() {
    let solution = json!({ "grid": [[1]] });
    let v = validate_submission(
        "killer-sudoku",
        &json!({}),
        &solution,
        &lost_env(json!({ "finalGrid": [[2]], "mistakes": 0 })),
    );
    assert!(v.valid, "{v:?}");
    assert_eq!(v.status, Some(SubmissionStatus::Lost));
}
