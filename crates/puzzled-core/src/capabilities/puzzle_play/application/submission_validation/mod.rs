//! Server-authoritative submission validation dispatch (ADR-170).
//!
//! Every game's final submission is validated against the puzzle the server
//! served (stored content or deterministic generation). Solutions never leave
//! the server; clients never supply scores or verdicts.
//!
//! Each adapter mirrors the client's `endGame` data shape (see
//! `apps/puzzled/src/games/*`) and the game's stored solution shape, then
//! delegates to the per-game pure kernel.

use serde_json::Value;

use crate::capabilities::puzzle_play::domain::scoring::SubmissionStatus;

mod logic;
mod numbers;
mod spatial;
mod word_deduction;
mod word_grid;
mod wordplay;

/// Full client submission envelope (endGame) passed to validation.
#[derive(Debug, Clone)]
pub struct SubmissionEnvelope {
    pub status: SubmissionStatus,
    pub attempts: u32,
    pub time_spent_ms: u64,
    pub data: Value,
}

/// Common verdict produced by every game adapter.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct SubmissionVerdict {
    pub valid: bool,
    pub status: Option<SubmissionStatus>,
    pub score: Option<u32>,
    pub error: Option<String>,
}

impl SubmissionVerdict {
    fn invalid(error: impl Into<String>) -> Self {
        Self {
            valid: false,
            status: None,
            score: None,
            error: Some(error.into()),
        }
    }

    fn valid(status: SubmissionStatus, score: u32) -> Self {
        Self {
            valid: true,
            status: Some(status),
            score: Some(score),
            error: None,
        }
    }
}

fn status_from_wl(
    status: crate::capabilities::puzzle_play::domain::wordle_eval::SubmissionStatus,
) -> SubmissionStatus {
    match status {
        crate::capabilities::puzzle_play::domain::wordle_eval::SubmissionStatus::Won => {
            SubmissionStatus::Won
        }
        crate::capabilities::puzzle_play::domain::wordle_eval::SubmissionStatus::Lost => {
            SubmissionStatus::Lost
        }
    }
}

type ModuleValidator = fn(&Value, &Value, &SubmissionEnvelope) -> SubmissionVerdict;

fn validator_for(game_slug: &str) -> Option<ModuleValidator> {
    match crate::capabilities::puzzle_play::domain::game_slugs::canonicalize_game_slug(game_slug) {
        "word-guess" => Some(word_deduction::word_guess),
        "word-groups" => Some(wordplay::word_groups),
        "word-hive" => Some(wordplay::word_hive),
        "crossword" => Some(word_grid::crossword),
        "sudoku" => Some(numbers::sudoku),
        "nonogram" => Some(logic::nonogram),
        "word-ladder" => Some(wordplay::word_ladder),
        "arithmo" => Some(numbers::arithmo),
        "pattern-match" => Some(logic::pattern_match),
        "block-slide" => Some(spatial::block_slide),
        "crowns" | "queens" => Some(logic::queens),
        "duo" | "tango" => Some(logic::tango),
        "word-box" => Some(wordplay::word_box),
        "quad-words" => Some(word_deduction::quad_words),
        "killer-sudoku" => Some(numbers::killer_sudoku),
        "cryptogram" => Some(word_deduction::cryptogram),
        "word-search" => Some(word_grid::word_search),
        "number-path" => Some(spatial::number_path),
        "pip-place" => Some(spatial::pip_place),
        _ => None,
    }
}

/// True when SubmitGuess has a server validator for this slug (or inbound alias).
#[must_use]
pub fn has_server_validator(game_slug: &str) -> bool {
    validator_for(game_slug).is_some()
}

/// Validate a final submission for a served puzzle.
///
/// `puzzle_data` and `solution` are the JSON the server holds for the served
/// puzzle (never sent to clients); `submission` is the client's `endGame.data`.
pub fn validate_submission(
    game_slug: &str,
    puzzle_data: &Value,
    solution: &Value,
    env: &SubmissionEnvelope,
) -> SubmissionVerdict {
    match validator_for(game_slug) {
        Some(validate) => validate(puzzle_data, solution, env),
        None => {
            let other =
                crate::capabilities::puzzle_play::domain::game_slugs::canonicalize_game_slug(
                    game_slug,
                );
            SubmissionVerdict::invalid(format!("unsupported game slug: {other}"))
        }
    }
}

fn claimed_wl(
    status: SubmissionStatus,
) -> crate::capabilities::puzzle_play::domain::wordle_eval::SubmissionStatus {
    match status {
        SubmissionStatus::Won => {
            crate::capabilities::puzzle_play::domain::wordle_eval::SubmissionStatus::Won
        }
        SubmissionStatus::Lost => {
            crate::capabilities::puzzle_play::domain::wordle_eval::SubmissionStatus::Lost
        }
    }
}

#[cfg(test)]
mod tests;
