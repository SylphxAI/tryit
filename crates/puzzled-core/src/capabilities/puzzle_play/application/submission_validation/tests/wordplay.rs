use super::super::{validate_submission, SubmissionEnvelope, SubmissionStatus};
use super::{env, lost_env};
use serde_json::{json, Value};

fn word_groups_solution() -> Value {
    json!({
        "categories": [
            {"name": "Fruits", "words": ["APPLE", "BANANA", "CHERRY", "DATE"], "level": 0},
            {"name": "Colors", "words": ["RED", "BLUE", "GREEN", "YELLOW"], "level": 1},
            {"name": "Animals", "words": ["DOG", "CAT", "BIRD", "FISH"], "level": 2},
            {"name": "Numbers", "words": ["ONE", "TWO", "THREE", "FOUR"], "level": 3}
        ]
    })
}

#[test]
fn word_groups_accepts_win_from_found_categories() {
    let found = json!({
        "foundCategories": [
            ["APPLE", "BANANA", "CHERRY", "DATE"],
            ["RED", "BLUE", "GREEN", "YELLOW"],
            ["DOG", "CAT", "BIRD", "FISH"],
            ["ONE", "TWO", "THREE", "FOUR"]
        ],
        "mistakes": 1
    });
    let v = validate_submission(
        "word-groups",
        &json!({}),
        &word_groups_solution(),
        &env(found),
    );
    assert!(v.valid, "{v:?}");
    assert_eq!(v.status, Some(SubmissionStatus::Won));
    assert_eq!(v.score, Some(75));
}

#[test]
fn word_groups_accepts_loss_when_not_all_found() {
    let mut envelope = env(json!({
        "foundCategories": [
            ["APPLE", "BANANA", "CHERRY", "DATE"]
        ],
        "mistakes": 4
    }));
    envelope.status = SubmissionStatus::Lost;
    let v = validate_submission(
        "word-groups",
        &json!({}),
        &word_groups_solution(),
        &envelope,
    );
    assert!(v.valid, "{v:?}");
    assert_eq!(v.status, Some(SubmissionStatus::Lost));
    assert_eq!(v.score, Some(0));
}

#[test]
fn word_groups_rejects_false_win() {
    let v = validate_submission(
        "word-groups",
        &json!({}),
        &word_groups_solution(),
        &env(json!({
            "foundCategories": [["APPLE", "BANANA", "CHERRY", "DATE"]],
            "mistakes": 0
        })),
    );
    assert!(!v.valid);
}

#[test]
fn word_ladder_accepts_an_honest_loss() {
    let solution = json!({ "path": ["CAT", "COT", "COG", "DOG"] });
    let v = validate_submission(
        "word-ladder",
        &json!({}),
        &solution,
        &lost_env(json!({ "path": ["CAT"] })),
    );
    assert!(v.valid, "{v:?}");
    assert_eq!(v.status, Some(SubmissionStatus::Lost));
}

#[test]
fn word_box_accepts_the_generator_letter_array() {
    let solution = json!({ "allLetters": ["A","B","C","D","E","F","G","H","I","J","K","L"] });
    let string_shape = json!({ "allLetters": "ABCDEFGHIJKL" });
    let env = SubmissionEnvelope {
        status: SubmissionStatus::Won,
        attempts: 1,
        time_spent_ms: 1,
        data: json!({ "words": ["ABCD"] }),
    };
    // Both shapes read the same letters, so both give the same verdict.
    assert_eq!(
        validate_submission("word-box", &json!({}), &solution, &env),
        validate_submission("word-box", &json!({}), &string_shape, &env)
    );
    assert_ne!(
        validate_submission("word-box", &json!({}), &solution, &env)
            .error
            .as_deref(),
        Some("Missing allLetters solution")
    );
}

#[test]
fn word_box_accepts_an_honest_loss() {
    let solution = json!({ "allLetters": "ABCDEFGHIJKL" });
    let v = validate_submission(
        "word-box",
        &json!({}),
        &solution,
        &lost_env(json!({ "words": [] })),
    );
    assert!(v.valid, "{v:?}");
    assert_eq!(v.status, Some(SubmissionStatus::Lost));
}
