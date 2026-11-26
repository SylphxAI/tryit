use super::super::{validate_submission, SubmissionStatus};
use super::{env, lost_env};
use serde_json::json;

#[test]
fn tango_accepts_full_solution() {
    let solution = json!({ "grid": [["sun","moon"],["moon","sun"]] });
    let data = env(json!({ "grid": [["sun","moon"],["moon","sun"]] }));
    let v = validate_submission("tango", &json!({}), &solution, &data);
    assert!(v.valid, "expected valid: {v:?}");
}

#[test]
fn nonogram_accepts_an_honest_loss() {
    let solution = json!({ "grid": [[true, false], [false, true]] });
    let v = validate_submission(
        "nonogram",
        &json!({}),
        &solution,
        &lost_env(json!({ "finalGrid": [[false, false], [false, false]] })),
    );
    assert!(v.valid, "{v:?}");
    assert_eq!(v.status, Some(SubmissionStatus::Lost));
}

#[test]
fn tango_accepts_an_honest_loss() {
    let solution = json!({ "grid": [["sun", "moon"], ["moon", "sun"]] });
    let v = validate_submission(
        "tango",
        &json!({}),
        &solution,
        &lost_env(json!({ "grid": [[null, null], [null, null]] })),
    );
    assert!(v.valid, "{v:?}");
    assert_eq!(v.status, Some(SubmissionStatus::Lost));
}

#[test]
fn pattern_match_accepts_an_honest_loss() {
    let solution = json!({ "validSets": [[0, 1, 2]], "totalSets": 1 });
    let v = validate_submission(
        "pattern-match",
        &json!({}),
        &solution,
        &lost_env(json!({ "foundSets": [], "mistakes": 3 })),
    );
    assert!(v.valid, "{v:?}");
    assert_eq!(v.status, Some(SubmissionStatus::Lost));
    assert_eq!(v.score, Some(0));
}

#[test]
fn pattern_match_rejects_a_loss_claim_with_all_sets() {
    let solution = json!({ "validSets": [[0, 1, 2]], "totalSets": 1 });
    let v = validate_submission(
        "pattern-match",
        &json!({}),
        &solution,
        &lost_env(json!({ "foundSets": [[0, 1, 2]], "mistakes": 0 })),
    );
    assert!(!v.valid, "{v:?}");
}

#[test]
fn pattern_match_still_rejects_a_false_win() {
    let solution = json!({ "validSets": [[0, 1, 2]], "totalSets": 1 });
    let v = validate_submission(
        "pattern-match",
        &json!({}),
        &solution,
        &env(json!({ "foundSets": [], "mistakes": 0 })),
    );
    assert!(!v.valid, "{v:?}");
}

#[test]
fn crowns_incomplete_claimed_lost_is_valid_zero() {
    let puzzle = json!({
        "size": 4,
        "regions": [
            [0, 0, 1, 1],
            [0, 0, 1, 1],
            [2, 2, 3, 3],
            [2, 2, 3, 3]
        ]
    });
    let empty = json!({
        "finalGrid": [
            [false, false, false, false],
            [false, false, false, false],
            [false, false, false, false],
            [false, false, false, false]
        ]
    });
    let mut envelope = env(empty);
    envelope.status = SubmissionStatus::Lost;
    let v = validate_submission("crowns", &puzzle, &json!({ "queens": [] }), &envelope);
    assert!(v.valid, "{v:?}");
    assert_eq!(v.status, Some(SubmissionStatus::Lost));
    assert_eq!(v.score, Some(0));
}
