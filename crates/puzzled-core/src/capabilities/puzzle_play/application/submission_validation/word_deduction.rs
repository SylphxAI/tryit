//! Hidden-word and cipher game adapters.

use serde::Deserialize;
use serde_json::Value;

use super::{claimed_wl, status_from_wl, SubmissionEnvelope, SubmissionVerdict};
use crate::capabilities::puzzle_play::domain::scoring::SubmissionStatus;

// ---------------------------------------------------------------------------
// word-guess (Wordle): solution {word}; submission {guesses: string[]}
// ---------------------------------------------------------------------------

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct WordGuessSubmission {
    guesses: Vec<String>,
}

pub(super) fn word_guess(
    _puzzle_data: &Value,
    solution: &Value,
    env: &SubmissionEnvelope,
) -> SubmissionVerdict {
    use crate::capabilities::puzzle_play::domain::wordle_eval;
    let Ok(sub) = serde_json::from_value::<WordGuessSubmission>(env.data.clone()) else {
        return SubmissionVerdict::invalid("Missing guesses data");
    };
    let Some(word) = solution.get("word").and_then(Value::as_str) else {
        return SubmissionVerdict::invalid("Missing solution word");
    };
    let result =
        wordle_eval::validate_and_score(word, Some(&sub.guesses), claimed_wl(env.status), None);
    match result {
        wordle_eval::GameResult::Invalid { error } => SubmissionVerdict::invalid(error),
        wordle_eval::GameResult::Valid { status, score } => {
            SubmissionVerdict::valid(status_from_wl(status), score)
        }
    }
}

// ---------------------------------------------------------------------------
// quad-words (Quordle): solution {words: string[4]};
// submission {guessHistory: string[], solvedBoards: boolean[]}
// ---------------------------------------------------------------------------

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct QuadWordsSubmission {
    #[serde(default)]
    guess_history: Option<Vec<String>>,
    #[serde(default)]
    solved_boards: Option<Vec<bool>>,
}

pub(super) fn quad_words(
    _puzzle_data: &Value,
    solution: &Value,
    env: &SubmissionEnvelope,
) -> SubmissionVerdict {
    use crate::capabilities::puzzle_play::domain::quad_words;
    let Ok(sub) = serde_json::from_value::<QuadWordsSubmission>(env.data.clone()) else {
        return SubmissionVerdict::invalid("Invalid quad-words submission");
    };
    let Some(words) = solution.get("words").and_then(Value::as_array) else {
        return SubmissionVerdict::invalid("Missing quad-words solution words");
    };
    let targets: Vec<String> = words
        .iter()
        .filter_map(Value::as_str)
        .map(ToString::to_string)
        .collect();
    if targets.len() != 4 {
        return SubmissionVerdict::invalid("Invalid quad-words solution");
    }
    // Server-side replay: derive solved boards from the guess history alone.
    let Some(history) = sub.guess_history.as_ref() else {
        return SubmissionVerdict::invalid("Missing guess history data");
    };
    let mut solved = [false; 4];
    for guess in history {
        if let Err(error) = super::super::grading::quad_words::validate_word(guess) {
            return SubmissionVerdict::invalid(error);
        }
        for (i, target) in targets.iter().enumerate() {
            if !solved[i] && quad_words::guess_solves_target(guess, target) {
                solved[i] = true;
            }
        }
    }
    let solved_count = solved.iter().filter(|s| **s).count() as u32;
    if let Some(client_claimed) = sub.solved_boards.as_ref() {
        let claimed_count = client_claimed.iter().filter(|b| **b).count() as u32;
        if claimed_count != solved_count {
            return SubmissionVerdict::invalid("Solved-board claim does not match guess history");
        }
    }
    let result = quad_words::validate_and_score(
        Some(solved_count),
        Some(history.len() as u32),
        match env.status {
            SubmissionStatus::Won => quad_words::SubmissionStatus::Won,
            SubmissionStatus::Lost => quad_words::SubmissionStatus::Lost,
        },
    );
    match result {
        quad_words::GameResult::Invalid { error } => SubmissionVerdict::invalid(error),
        quad_words::GameResult::Valid { status, score } => SubmissionVerdict::valid(
            match status {
                quad_words::SubmissionStatus::Won => SubmissionStatus::Won,
                quad_words::SubmissionStatus::Lost => SubmissionStatus::Lost,
            },
            score,
        ),
    }
}

// ---------------------------------------------------------------------------
// cryptogram: solution {reverseCipher}; submission {guesses: Record<string,string>, hintsUsed}
// ---------------------------------------------------------------------------

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct CryptogramSubmission {
    guesses: std::collections::BTreeMap<String, String>,
    #[serde(default)]
    hints_used: Option<u32>,
}

/// Cipher letters the player must decode: those present in the served puzzle
/// text. Older rows without the text fall back to every letter of the solution
/// (strictest), never to fewer.
fn cryptogram_required_letters(
    puzzle_data: &Value,
    cipher: &std::collections::BTreeMap<String, String>,
) -> std::collections::BTreeSet<char> {
    use crate::capabilities::puzzle_play::domain::cryptogram;
    let text = puzzle_data
        .get("encryptedText")
        .or_else(|| {
            puzzle_data
                .get("puzzleData")
                .and_then(|p| p.get("encryptedText"))
        })
        .and_then(Value::as_str);
    match text {
        Some(t) if !cryptogram::unique_encrypted_letters(t).is_empty() => {
            cryptogram::unique_encrypted_letters(t)
        }
        _ => cipher
            .keys()
            .filter_map(|k| k.chars().next())
            .map(|c| c.to_ascii_uppercase())
            .collect(),
    }
}

pub(super) fn cryptogram(
    puzzle_data: &Value,
    solution: &Value,
    env: &SubmissionEnvelope,
) -> SubmissionVerdict {
    use crate::capabilities::puzzle_play::domain::cryptogram;
    let Ok(sub) = serde_json::from_value::<CryptogramSubmission>(env.data.clone()) else {
        return SubmissionVerdict::invalid("Missing guesses data");
    };
    let Some(reverse_cipher) = solution.get("reverseCipher").and_then(Value::as_object) else {
        return SubmissionVerdict::invalid("Missing reverseCipher solution");
    };
    let mut cipher: std::collections::BTreeMap<String, String> = std::collections::BTreeMap::new();
    for (k, v) in reverse_cipher {
        if let Some(v) = v.as_str() {
            cipher.insert(k.clone(), v.to_string());
        }
    }
    let required = cryptogram_required_letters(puzzle_data, &cipher);
    let result = cryptogram::validate_and_score(
        &cipher,
        Some(&sub.guesses),
        &required,
        sub.hints_used,
        env.time_spent_ms,
        match env.status {
            SubmissionStatus::Won => cryptogram::SubmissionStatus::Won,
            SubmissionStatus::Lost => cryptogram::SubmissionStatus::Lost,
        },
    );
    match result {
        cryptogram::GameResult::Invalid { error } => SubmissionVerdict::invalid(error),
        cryptogram::GameResult::Valid { status, score } => SubmissionVerdict::valid(
            match status {
                cryptogram::SubmissionStatus::Won => SubmissionStatus::Won,
                cryptogram::SubmissionStatus::Lost => SubmissionStatus::Lost,
            },
            score,
        ),
    }
}
