//! Word grouping, construction, and chaining game adapters.

use serde::Deserialize;
use serde_json::Value;

use super::{SubmissionEnvelope, SubmissionVerdict};
use crate::capabilities::puzzle_play::domain::scoring::SubmissionStatus;

// ---------------------------------------------------------------------------
// word-groups (Connections): solution {categories:[{name,words,level}]};
// submission {foundCategories: string[][], mistakes: number}
// ---------------------------------------------------------------------------

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct WordGroupsSubmission {
    #[serde(default)]
    found_categories: Option<Vec<Vec<String>>>,
    #[serde(default)]
    mistakes: Option<u32>,
}

pub(super) fn word_groups(
    _puzzle_data: &Value,
    solution: &Value,
    env: &SubmissionEnvelope,
) -> SubmissionVerdict {
    use crate::capabilities::puzzle_play::domain::word_groups;
    let Ok(sub) = serde_json::from_value::<WordGroupsSubmission>(env.data.clone()) else {
        return SubmissionVerdict::invalid("Invalid word-groups submission");
    };
    let Some(cats) = solution.get("categories").and_then(Value::as_array) else {
        return SubmissionVerdict::invalid("Missing categories solution");
    };
    let mut categories: Vec<word_groups::Category> = Vec::new();
    for c in cats {
        let Some(name) = c.get("name").and_then(Value::as_str) else {
            return SubmissionVerdict::invalid("Invalid category name");
        };
        let Some(words) = c.get("words").and_then(Value::as_array) else {
            return SubmissionVerdict::invalid("Invalid category words");
        };
        let words: Vec<String> = words
            .iter()
            .filter_map(Value::as_str)
            .map(ToString::to_string)
            .collect();
        let level = c.get("level").and_then(Value::as_u64).unwrap_or(0) as u8;
        categories.push(word_groups::Category {
            name: name.to_string(),
            words,
            level,
        });
    }
    let claimed = match env.status {
        SubmissionStatus::Won => word_groups::SubmissionStatus::Won,
        SubmissionStatus::Lost => word_groups::SubmissionStatus::Lost,
    };
    let result = word_groups::validate_and_score(
        &categories,
        sub.found_categories.as_deref(),
        sub.mistakes,
        claimed,
    );
    match result {
        word_groups::GameResult::Invalid { error } => SubmissionVerdict::invalid(error),
        word_groups::GameResult::Valid { status, score } => SubmissionVerdict::valid(
            match status {
                word_groups::SubmissionStatus::Won => SubmissionStatus::Won,
                word_groups::SubmissionStatus::Lost => SubmissionStatus::Lost,
            },
            score,
        ),
    }
}

// ---------------------------------------------------------------------------
// word-hive (Spelling Bee): solution {validWords, pangrams};
// submission {foundWords: string[]}
// ---------------------------------------------------------------------------

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct WordHiveSubmission {
    found_words: Vec<String>,
}

pub(super) fn word_hive(
    _puzzle_data: &Value,
    solution: &Value,
    env: &SubmissionEnvelope,
) -> SubmissionVerdict {
    use crate::capabilities::puzzle_play::domain::word_hive;
    let Ok(sub) = serde_json::from_value::<WordHiveSubmission>(env.data.clone()) else {
        return SubmissionVerdict::invalid("Missing found words data");
    };
    let mut valid_words = std::collections::HashSet::new();
    let mut pangrams = std::collections::HashSet::new();
    if let Some(list) = solution.get("validWords").and_then(Value::as_array) {
        for w in list.iter().filter_map(Value::as_str) {
            valid_words.insert(w.to_ascii_uppercase());
        }
    }
    if let Some(list) = solution.get("pangrams").and_then(Value::as_array) {
        for w in list.iter().filter_map(Value::as_str) {
            pangrams.insert(w.to_ascii_uppercase());
        }
    }
    let found: Vec<String> = sub
        .found_words
        .iter()
        .map(|w| w.to_ascii_uppercase())
        .collect();
    let result = word_hive::validate_and_score(&valid_words, &pangrams, Some(&found));
    match result {
        word_hive::GameResult::Invalid { error } => SubmissionVerdict::invalid(error),
        word_hive::GameResult::Valid { score, .. } => {
            SubmissionVerdict::valid(SubmissionStatus::Won, score)
        }
    }
}

// ---------------------------------------------------------------------------
// word-ladder: solution {path: string[]}; submission {path: string[]}
// ---------------------------------------------------------------------------

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct WordLadderSubmission {
    path: Vec<String>,
}

pub(super) fn word_ladder(
    _puzzle_data: &Value,
    solution: &Value,
    env: &SubmissionEnvelope,
) -> SubmissionVerdict {
    use crate::capabilities::puzzle_play::domain::word_ladder;
    let Ok(sub) = serde_json::from_value::<WordLadderSubmission>(env.data.clone()) else {
        return SubmissionVerdict::invalid("Missing path data");
    };
    let Some(path) = solution.get("path").and_then(Value::as_array) else {
        return SubmissionVerdict::invalid("Missing ladder solution path");
    };
    let solution_path: Vec<String> = path
        .iter()
        .filter_map(Value::as_str)
        .map(ToString::to_string)
        .collect();
    let result = word_ladder::validate_and_score(
        &solution_path,
        Some(&sub.path),
        match env.status {
            SubmissionStatus::Won => word_ladder::SubmissionStatus::Won,
            SubmissionStatus::Lost => word_ladder::SubmissionStatus::Lost,
        },
        None,
    );
    match result {
        word_ladder::GameResult::Invalid { error } => SubmissionVerdict::invalid(error),
        word_ladder::GameResult::Valid { status, score } => SubmissionVerdict::valid(
            match status {
                word_ladder::SubmissionStatus::Won => SubmissionStatus::Won,
                word_ladder::SubmissionStatus::Lost => SubmissionStatus::Lost,
            },
            score,
        ),
    }
}

// ---------------------------------------------------------------------------
// word-box (Letter Boxed): solution {words, allLetters};
// submission {words: string[]}
// ---------------------------------------------------------------------------

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct WordBoxSubmission {
    words: Vec<String>,
}

pub(super) fn word_box(
    _puzzle_data: &Value,
    solution: &Value,
    env: &SubmissionEnvelope,
) -> SubmissionVerdict {
    use crate::capabilities::puzzle_play::domain::word_box;
    let Ok(sub) = serde_json::from_value::<WordBoxSubmission>(env.data.clone()) else {
        return SubmissionVerdict::invalid("Missing words data");
    };
    // The generator stores the twelve letters as an array of one-letter
    // strings; an older shape stored one string. Accept both.
    let all_letters: Option<String> = match solution.get("allLetters") {
        Some(Value::String(s)) => Some(s.clone()),
        Some(Value::Array(items)) => items
            .iter()
            .map(|v| v.as_str().map(str::to_string))
            .collect::<Option<Vec<String>>>()
            .map(|parts| parts.concat()),
        _ => None,
    };
    let Some(all_letters) = all_letters else {
        return SubmissionVerdict::invalid("Missing allLetters solution");
    };
    let letters: Vec<char> = all_letters.chars().collect();
    let result = word_box::validate_and_score(
        &letters,
        Some(&sub.words),
        match env.status {
            SubmissionStatus::Won => word_box::SubmissionStatus::Won,
            SubmissionStatus::Lost => word_box::SubmissionStatus::Lost,
        },
    );
    match result {
        word_box::GameResult::Invalid { error } => SubmissionVerdict::invalid(error),
        word_box::GameResult::Valid { status, score } => SubmissionVerdict::valid(
            match status {
                word_box::SubmissionStatus::Won => SubmissionStatus::Won,
                word_box::SubmissionStatus::Lost => SubmissionStatus::Lost,
            },
            score,
        ),
    }
}
