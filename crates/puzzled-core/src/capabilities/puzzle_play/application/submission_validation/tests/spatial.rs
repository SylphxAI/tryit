use super::super::{has_server_validator, validate_submission, SubmissionStatus};
use super::{env, lost_env};
use serde_json::{json, Value};

#[test]
fn block_slide_uses_server_min_moves() {
    let solution = json!({ "minMoves": 5 });
    let data = env(json!({ "moveCount": 5, "minMoves": 1 })); // client minMoves ignored
    let v = validate_submission("block-slide", &json!({}), &solution, &data);
    assert!(v.valid, "expected valid: {v:?}");
}

#[test]
fn block_slide_accepts_an_honest_loss() {
    let solution = json!({ "minMoves": 10 });
    let v = validate_submission(
        "block-slide",
        &json!({}),
        &solution,
        &lost_env(json!({ "moveCount": 4 })),
    );
    assert!(v.valid, "{v:?}");
    assert_eq!(v.status, Some(SubmissionStatus::Lost));
}

fn number_path_clues() -> Value {
    json!({
        "size": 3,
        "clues": [
            [1, null, null],
            [null, null, null],
            [null, null, 9]
        ]
    })
}

fn number_path_path_a() -> Value {
    json!({
        "path": [
            {"row": 0, "col": 0},
            {"row": 0, "col": 1},
            {"row": 0, "col": 2},
            {"row": 1, "col": 2},
            {"row": 1, "col": 1},
            {"row": 1, "col": 0},
            {"row": 2, "col": 0},
            {"row": 2, "col": 1},
            {"row": 2, "col": 2}
        ]
    })
}

fn number_path_path_b() -> Value {
    json!({
        "path": [
            {"row": 0, "col": 0},
            {"row": 1, "col": 0},
            {"row": 2, "col": 0},
            {"row": 2, "col": 1},
            {"row": 1, "col": 1},
            {"row": 0, "col": 1},
            {"row": 0, "col": 2},
            {"row": 1, "col": 2},
            {"row": 2, "col": 2}
        ]
    })
}

fn number_path_incomplete() -> Value {
    json!({
        "path": [
            {"row": 0, "col": 0},
            {"row": 0, "col": 1},
            {"row": 0, "col": 2},
            {"row": 1, "col": 2}
        ]
    })
}

#[test]
fn number_path_has_server_validator() {
    assert!(has_server_validator("number-path"));
}

#[test]
fn number_path_accepts_alternate_hamiltonian_path() {
    let v = validate_submission(
        "number-path",
        &number_path_clues(),
        &number_path_path_a(),
        &env(number_path_path_b()),
    );
    assert!(v.valid, "{v:?}");
    assert_eq!(v.status, Some(SubmissionStatus::Won));
    assert_eq!(v.score, Some(500));
}

#[test]
fn number_path_rejects_false_win() {
    let v = validate_submission(
        "number-path",
        &number_path_clues(),
        &number_path_path_a(),
        &env(number_path_incomplete()),
    );
    assert!(!v.valid);
    assert!(v
        .error
        .as_deref()
        .is_some_and(|e| e.contains("not correctly solved")));
}

#[test]
fn number_path_missing_path_is_not_unsupported_slug() {
    let v = validate_submission(
        "number-path",
        &number_path_clues(),
        &json!({}),
        &env(json!({})),
    );
    assert!(!v.valid);
    assert_eq!(v.error.as_deref(), Some("Missing path"));
    assert!(v
        .error
        .as_deref()
        .is_none_or(|e| !e.starts_with("unsupported game slug:")));
}

#[test]
fn number_path_incomplete_claimed_lost_is_valid_zero() {
    let mut envelope = env(number_path_incomplete());
    envelope.status = SubmissionStatus::Lost;
    let v = validate_submission(
        "number-path",
        &number_path_clues(),
        &number_path_path_a(),
        &envelope,
    );
    assert!(v.valid, "{v:?}");
    assert_eq!(v.status, Some(SubmissionStatus::Lost));
    assert_eq!(v.score, Some(0));
}

fn pip_place_puzzle() -> Value {
    json!({
        "maxPip": 1,
        "rows": 2,
        "cols": 3,
        "regionOf": [
            [1, 1, 0],
            [1, 1, 1]
        ],
        "regions": [
            {"id": 0, "kind": "sum", "value": 0},
            {"id": 1, "kind": "free", "value": null}
        ]
    })
}

fn pip_place_tiles_a() -> Value {
    json!({
        "tiles": [
            {"a": {"row": 0, "col": 0}, "b": {"row": 1, "col": 0}, "pa": 0, "pb": 0},
            {"a": {"row": 0, "col": 1}, "b": {"row": 1, "col": 1}, "pa": 1, "pb": 1},
            {"a": {"row": 0, "col": 2}, "b": {"row": 1, "col": 2}, "pa": 0, "pb": 1}
        ]
    })
}

fn pip_place_tiles_b() -> Value {
    json!({
        "tiles": [
            {"a": {"row": 0, "col": 0}, "b": {"row": 0, "col": 1}, "pa": 0, "pb": 0},
            {"a": {"row": 1, "col": 0}, "b": {"row": 1, "col": 1}, "pa": 1, "pb": 1},
            {"a": {"row": 0, "col": 2}, "b": {"row": 1, "col": 2}, "pa": 0, "pb": 1}
        ]
    })
}

fn pip_place_incomplete() -> Value {
    json!({
        "tiles": [
            {"a": {"row": 0, "col": 0}, "b": {"row": 1, "col": 0}, "pa": 0, "pb": 0},
            {"a": {"row": 0, "col": 1}, "b": {"row": 1, "col": 1}, "pa": 1, "pb": 1}
        ]
    })
}

#[test]
fn pip_place_has_server_validator() {
    assert!(has_server_validator("pip-place"));
}

#[test]
fn pip_place_accepts_alternate_tiling() {
    let v = validate_submission(
        "pip-place",
        &pip_place_puzzle(),
        &pip_place_tiles_a(),
        &env(pip_place_tiles_b()),
    );
    assert!(v.valid, "{v:?}");
    assert_eq!(v.status, Some(SubmissionStatus::Won));
    assert_eq!(v.score, Some(500));
}

#[test]
fn pip_place_rejects_false_win() {
    let v = validate_submission(
        "pip-place",
        &pip_place_puzzle(),
        &pip_place_tiles_a(),
        &env(pip_place_incomplete()),
    );
    assert!(!v.valid);
    assert!(v
        .error
        .as_deref()
        .is_some_and(|e| e.contains("not correctly solved")));
}

#[test]
fn pip_place_missing_tiles_is_not_unsupported_slug() {
    let v = validate_submission(
        "pip-place",
        &pip_place_puzzle(),
        &json!({}),
        &env(json!({})),
    );
    assert!(!v.valid);
    assert_eq!(v.error.as_deref(), Some("Missing tiles"));
    assert!(v
        .error
        .as_deref()
        .is_none_or(|e| !e.starts_with("unsupported game slug:")));
}

#[test]
fn pip_place_incomplete_claimed_lost_is_valid_zero() {
    let mut envelope = env(pip_place_incomplete());
    envelope.status = SubmissionStatus::Lost;
    let v = validate_submission(
        "pip-place",
        &pip_place_puzzle(),
        &pip_place_tiles_a(),
        &envelope,
    );
    assert!(v.valid, "{v:?}");
    assert_eq!(v.status, Some(SubmissionStatus::Lost));
    assert_eq!(v.score, Some(0));
}
