use super::super::{validate_submission, SubmissionStatus};
use super::{env, lost_env};
use serde_json::{json, Value};

fn crossword_solution() -> Value {
    json!({ "grid": [
        ["C","A","P","E","R"],
        ["A","L","I","V","E"],
        ["P","I","P","E","R"],
        ["E","V","E","N","T"],
        ["R","E","S","T","S"]
    ] })
}

fn empty_crossword_grid() -> Value {
    json!([
        [null, null, null, null, null],
        [null, null, null, null, null],
        [null, null, null, null, null],
        [null, null, null, null, null],
        [null, null, null, null, null]
    ])
}

/// Honest give-ups must be recordable terminals for every module whose
/// domain accepts a loss claim; the adapters previously hard-coded `Won`
/// and turned every give-up into "Invalid win claim".
#[test]
fn crossword_accepts_an_honest_loss() {
    let v = validate_submission(
        "crossword",
        &json!({}),
        &crossword_solution(),
        &lost_env(json!({ "finalGrid": empty_crossword_grid() })),
    );
    assert!(v.valid, "{v:?}");
    assert_eq!(v.status, Some(SubmissionStatus::Lost));
}

#[test]
fn crossword_wrong_check_identifies_cells_without_answers() {
    let solution = crossword_solution();
    let mut wrong = solution["grid"].clone();
    wrong[0][1] = json!("Z");
    wrong[4][4] = json!("Z");
    let v = validate_submission(
        "crossword",
        &json!({}),
        &solution,
        &env(json!({"finalGrid": wrong})),
    );
    assert!(!v.valid);
    assert_eq!(
        v.error.as_deref(),
        Some("crossword_incorrect_cells:16777218")
    );
}

#[test]
fn crossword_still_rejects_a_false_win() {
    let v = validate_submission(
        "crossword",
        &json!({}),
        &crossword_solution(),
        &env(json!({ "finalGrid": empty_crossword_grid() })),
    );
    assert!(!v.valid);
}

#[test]
fn word_search_accepts_an_honest_loss() {
    let solution = json!({ "words": ["CAT", "DOG"] });
    let v = validate_submission(
        "word-search",
        &json!({}),
        &solution,
        &lost_env(json!({ "foundWords": ["CAT"] })),
    );
    assert!(v.valid, "{v:?}");
    assert_eq!(v.status, Some(SubmissionStatus::Lost));
}
