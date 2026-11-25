//! Deterministic Five generator (free-floor fallback).
//!
//! Client payload is `{wordLength, maxAttempts}`; the solution word never
//! leaves the server (`client_safe_puzzle_data` strips a leaked `word`).

use std::sync::LazyLock;

use serde_json::{json, Value};

use super::wordle_eval::{MAX_GUESSES, WORD_LENGTH};

const SOLUTION_WORDS_RAW: &str = include_str!("data/word_guess_solutions.txt");

static SOLUTION_WORDS: LazyLock<Vec<&'static str>> = LazyLock::new(|| {
    SOLUTION_WORDS_RAW
        .lines()
        .filter(|line| !line.is_empty())
        .collect()
});

/// Common-word bank: the independently maintained Quad targets checked against the CC0 Frame lexicon.
#[must_use]
pub fn solution_word_count() -> usize {
    SOLUTION_WORDS.len()
}

/// Whether `word` (any case) is in the curated common-word list.
#[cfg(test)]
pub(crate) fn is_solution_word(word: &str) -> bool {
    SOLUTION_WORDS.iter().any(|w| w.eq_ignore_ascii_case(word))
}

fn word_from_seed(seed: i64) -> String {
    let words = SOLUTION_WORDS.as_slice();
    if words.is_empty() {
        panic!("word-guess solution list is empty");
    }
    let idx = (seed.unsigned_abs() as usize) % words.len();
    words[idx].to_ascii_uppercase()
}

/// Deterministic daily word-guess: (client-safe puzzle_data, solution).
#[must_use]
pub fn generate_word_guess_puzzle(seed: i64) -> (Value, Value) {
    let word = word_from_seed(seed);
    let puzzle_data = json!({
        "wordLength": WORD_LENGTH,
        "maxAttempts": MAX_GUESSES,
    });
    (puzzle_data, json!({ "word": word }))
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::capabilities::puzzle_play::crossword_generate::client_safe_puzzle_data;

    #[test]
    fn solution_bank_is_unique_and_playable() {
        use std::collections::HashSet;

        let allowed: HashSet<_> = include_str!("../application/grading/quad_words_allowed.txt")
            .lines()
            .collect();
        assert!(solution_word_count() >= 600);
        let mut unique = HashSet::new();
        for &word in SOLUTION_WORDS.iter() {
            assert_eq!(word.len(), WORD_LENGTH, "{word}");
            assert!(word.bytes().all(|byte| byte.is_ascii_lowercase()), "{word}");
            assert!(unique.insert(word), "duplicate solution: {word}");
            assert!(allowed.contains(word), "unplayable solution: {word}");
        }
    }

    #[test]
    fn seed_is_deterministic() {
        let first = generate_word_guess_puzzle(0);
        assert_eq!(first.1["word"], "ABASE");
        assert_eq!(generate_word_guess_puzzle(1).1["word"], "ABIDE");
        assert_eq!(generate_word_guess_puzzle(-1).1["word"], "ABIDE");
        assert_eq!(
            first,
            generate_word_guess_puzzle(solution_word_count() as i64)
        );
    }

    #[test]
    fn client_payload_has_no_solution_word() {
        let (pd, sol) = generate_word_guess_puzzle(0);
        assert_eq!(pd["wordLength"], WORD_LENGTH as u64);
        assert_eq!(pd["maxAttempts"], MAX_GUESSES);
        assert!(pd.get("word").is_none());
        assert!(pd.get("solution").is_none());
        let dumped = pd.to_string();
        assert!(
            !dumped.to_ascii_lowercase().contains("abase"),
            "solution must not appear in client puzzle_data: {dumped}"
        );
        assert_eq!(sol["word"], "ABASE");
    }

    #[test]
    fn client_safe_strips_leaked_word() {
        let leaked = json!({
            "wordLength": 5,
            "maxAttempts": 6,
            "word": "HASTE",
        });
        let safe = client_safe_puzzle_data(leaked);
        assert_eq!(safe.get("word"), None);
        assert_eq!(safe["wordLength"], 5);
    }
}
