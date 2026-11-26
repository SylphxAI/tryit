use super::super::{validate_submission, SubmissionStatus};
use super::{env, lost_env};
use serde_json::{json, Value};

#[test]
fn word_guess_validates_guesses() {
    let solution = json!({ "word": "HELLO" });
    let data = env(json!({ "guesses": ["HELLO"] }));
    let v = validate_submission("word-guess", &json!({}), &solution, &data);
    assert!(v.valid, "expected valid: {v:?}");
    assert_eq!(v.score, Some(100));
}

#[test]
fn word_guess_rejects_missing_guesses() {
    let solution = json!({ "word": "HELLO" });
    let v = validate_submission("word-guess", &json!({}), &solution, &env(json!({})));
    assert!(!v.valid);
}

#[test]
fn quad_words_replay_refuses_a_nonword_even_when_all_targets_are_solved() {
    let solution = json!({ "words": ["NAVAL", "ROCKY", "PUNCH", "LAUGH"] });
    let history = env(json!({"guessHistory": ["ZZZZZ", "NAVAL", "ROCKY", "PUNCH", "LAUGH"]}));
    let v = validate_submission("quad-words", &json!({}), &solution, &history);
    assert_eq!(v.error.as_deref(), Some("Not in word list"));
    let legal = env(json!({"guessHistory": ["AAHED", "NAVAL", "ROCKY", "PUNCH", "LAUGH"]}));
    assert!(validate_submission("quad-words", &json!({}), &solution, &legal).valid);
}

#[test]
fn quad_words_rejects_false_solved_claim() {
    let solution = json!({ "words": ["NAVAL", "ROCKY", "PUNCH", "LAUGH"] });
    // guesses that never solve any board; client claims 4 solved
    let data = env(
        json!({ "guessHistory": ["CRANE", "STALE"], "solvedBoards": [true, true, true, true] }),
    );
    let v = validate_submission("quad-words", &json!({}), &solution, &data);
    assert!(!v.valid);
}

#[test]
fn quad_words_accepts_an_honest_loss() {
    let solution = json!({ "words": ["NAVAL", "ROCKY", "PUNCH", "LAUGH"] });
    let v = validate_submission(
        "quad-words",
        &json!({}),
        &solution,
        &lost_env(
            json!({ "guessHistory": ["CRANE"], "solvedBoards": [false, false, false, false] }),
        ),
    );
    assert!(v.valid, "{v:?}");
    assert_eq!(v.status, Some(SubmissionStatus::Lost));
    assert_eq!(v.score, Some(0));
}

#[test]
fn cryptogram_accepts_an_honest_loss() {
    let solution = json!({ "reverseCipher": { "X": "A", "Y": "B" } });
    let v = validate_submission(
        "cryptogram",
        &json!({}),
        &solution,
        &lost_env(json!({ "guesses": { "X": "A" }, "hintsUsed": 1 })),
    );
    assert!(v.valid, "{v:?}");
    assert_eq!(v.status, Some(SubmissionStatus::Lost));
}

fn cryptogram_partial_alphabet() -> (Value, Value) {
    // Solution maps all 26 letters; the puzzle only uses A, B and C.
    let cipher: serde_json::Map<String, Value> = ('A'..='Z')
        .map(|c| {
            let plain = char::from(b'Z' - (c as u8 - b'A'));
            (c.to_string(), Value::String(plain.to_string()))
        })
        .collect();
    (
        json!({ "encryptedText": "ABC CBA!" }),
        json!({ "reverseCipher": cipher }),
    )
}

#[test]
fn cryptogram_accepts_a_win_decoding_only_the_letters_in_the_puzzle() {
    let (puzzle, solution) = cryptogram_partial_alphabet();
    let v = validate_submission(
        "cryptogram",
        &puzzle,
        &solution,
        &env(json!({ "guesses": { "A": "Z", "B": "Y", "C": "X" }, "hintsUsed": 0 })),
    );
    assert!(v.valid, "{v:?}");
    assert_eq!(v.status, Some(SubmissionStatus::Won));
}

#[test]
fn cryptogram_rejects_a_win_with_a_wrong_or_missing_present_letter() {
    let (puzzle, solution) = cryptogram_partial_alphabet();
    for guesses in [
        json!({ "A": "Z", "B": "Y", "C": "Q" }),
        json!({ "A": "Z", "B": "Y" }),
    ] {
        let v = validate_submission(
            "cryptogram",
            &puzzle,
            &solution,
            &env(json!({ "guesses": guesses, "hintsUsed": 0 })),
        );
        assert!(!v.valid, "{v:?}");
    }
}

#[test]
fn cryptogram_without_puzzle_text_requires_every_solution_letter() {
    let (_, solution) = cryptogram_partial_alphabet();
    // No encryptedText: fall back to all 26 keys, so a 3-letter decode is not a win.
    let v = validate_submission(
        "cryptogram",
        &json!({}),
        &solution,
        &env(json!({ "guesses": { "A": "Z", "B": "Y", "C": "X" }, "hintsUsed": 0 })),
    );
    assert!(!v.valid, "{v:?}");
}

#[test]
fn cryptogram_reads_puzzle_text_nested_under_puzzle_data() {
    let (puzzle, solution) = cryptogram_partial_alphabet();
    let nested = json!({ "puzzleData": puzzle });
    let v = validate_submission(
        "cryptogram",
        &nested,
        &solution,
        &env(json!({ "guesses": { "A": "Z", "B": "Y", "C": "X" }, "hintsUsed": 0 })),
    );
    assert!(v.valid, "{v:?}");
    assert_eq!(v.status, Some(SubmissionStatus::Won));
}
