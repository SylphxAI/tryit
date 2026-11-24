//! Grade one quad-words guess against the four hidden words, so the client
//! never holds them (`PuzzleService.CheckGuess`).
//!
//! Guess: `{"word":"CRANE"}`. Result: `{"boards":[[5 statuses] x4]}`, each
//! status `correct` | `present` | `absent`, board order as stored. The final
//! finish is still validated as a whole by `submission_validation`.

use std::collections::HashSet;
use std::sync::LazyLock;

use serde_json::{json, Value};

use crate::capabilities::puzzle_play::domain::wordle_eval::{evaluate_guess, LetterStatus};

// Mirror the web Word Guess bank; a TS test keeps this copy identical.
const WORDS: &str = include_str!("quad_words_allowed.txt");
static DICTIONARY: LazyLock<HashSet<&str>> = LazyLock::new(|| WORDS.lines().collect());

pub(in crate::capabilities::puzzle_play::application) fn validate_word(
    word: &str,
) -> Result<(), &'static str> {
    if word.len() != 5 || !word.bytes().all(|b| b.is_ascii_alphabetic()) {
        return Err("guess must be a five-letter word");
    }
    if !DICTIONARY.contains(word.to_ascii_lowercase().as_str()) {
        return Err("Not in word list");
    }
    Ok(())
}

fn status(s: &LetterStatus) -> &'static str {
    match s {
        LetterStatus::Correct => "correct",
        LetterStatus::Present => "present",
        LetterStatus::Absent => "absent",
    }
}

/// Grade `guess` against the stored `{"words":[4]}` solution.
pub fn grade(solution: &Value, guess: &Value) -> Result<Value, String> {
    let targets: Vec<&str> = solution
        .get("words")
        .and_then(Value::as_array)
        .ok_or("missing quad-words solution words")?
        .iter()
        .filter_map(Value::as_str)
        .collect();
    if targets.len() != 4 {
        return Err("quad-words solution needs four words".into());
    }
    let word = guess
        .get("word")
        .and_then(Value::as_str)
        .ok_or("missing guess word")?
        .trim();
    validate_word(word)?;
    let boards = targets
        .iter()
        .map(|target| {
            evaluate_guess(word, target)
                .map(|tiles| tiles.iter().map(status).collect::<Vec<_>>())
                .ok_or_else(|| "guess must be a five-letter word".to_string())
        })
        .collect::<Result<Vec<_>, String>>()?;
    Ok(json!({ "boards": boards }))
}

#[cfg(test)]
mod tests {
    use super::*;

    fn solution() -> Value {
        json!({"words": ["NAVAL", "ROCKY", "PUNCH", "LAUGH"]})
    }

    #[test]
    fn grades_each_board_without_returning_the_words() {
        let graded = grade(&solution(), &json!({"word": "punch"})).unwrap();
        assert_eq!(
            graded["boards"][2],
            json!(["correct", "correct", "correct", "correct", "correct"])
        );
        assert_eq!(graded["boards"].as_array().map(Vec::len), Some(4));
        let text = graded.to_string();
        for hidden in ["NAVAL", "ROCKY", "LAUGH"] {
            assert!(!text.contains(hidden));
        }
        // LAUGH vs NAVAL: L present, A correct, U/G/H absent.
        let graded = grade(&solution(), &json!({"word": "LAUGH"})).unwrap();
        assert_eq!(
            graded["boards"][0],
            json!(["present", "correct", "absent", "absent", "absent"])
        );
    }

    #[test]
    fn dictionary_rejects_nonwords_and_accepts_uncommon_guesses_and_all_targets() {
        assert_eq!(
            grade(&solution(), &json!({"word": "ZZZZZ"})),
            Err("Not in word list".into())
        );
        assert!(grade(&solution(), &json!({"word": " aahed "})).is_ok());
        for word in include_str!("../../generate/data/quad_words_words.txt").lines() {
            if word.len() == 5 {
                assert_eq!(validate_word(word), Ok(()), "unplayable target: {word}");
            }
        }
    }

    #[test]
    fn refuses_bad_guesses_and_solutions() {
        assert!(grade(&solution(), &json!({"word": "ABC"})).is_err());
        assert!(grade(&solution(), &json!({})).is_err());
        assert!(grade(&json!({"words": ["NAVAL"]}), &json!({"word": "NAVAL"})).is_err());
    }
}
