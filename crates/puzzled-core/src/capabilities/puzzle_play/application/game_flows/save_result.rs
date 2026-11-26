//! Validation and normalization before saving a game result.

use chrono::NaiveDate;
use serde::{Deserialize, Serialize};

use super::types::{map_session_difficulty, ClaimedStatus, GameMode};
use crate::capabilities::puzzle_play::daily_time::{
    is_valid_archive_date, parse_date_yyyy_mm_dd, puzzle_date_string_utc,
};
use crate::capabilities::puzzle_play::game_slugs::is_valid_game_slug;

/// Failures for save-result preflight (before scoring / DB write).
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum SaveResultError {
    InvalidGameSlug,
    InvalidMode,
    InvalidStatus,
    AbandonedNotValidatable,
    MissingArchiveDate,
    InvalidArchiveDate,
    InvalidDifficulty,
    AlreadyPlayed,
}

impl SaveResultError {
    #[must_use]
    pub fn message(&self) -> &'static str {
        match self {
            Self::InvalidGameSlug => "Game not found",
            Self::InvalidMode => "Invalid mode",
            Self::InvalidStatus => "Invalid status",
            Self::AbandonedNotValidatable => "Cannot validate abandoned game",
            Self::MissingArchiveDate => "archiveDate required for archive mode",
            Self::InvalidArchiveDate => "Invalid archiveDate",
            Self::InvalidDifficulty => "Invalid difficulty",
            Self::AlreadyPlayed => "Already played",
        }
    }

    #[must_use]
    pub fn status_code(&self) -> u16 {
        match self {
            Self::InvalidGameSlug => 404,
            Self::AlreadyPlayed => 409,
            _ => 400,
        }
    }
}

/// Normalized save-result preflight (pure; no DB).
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SaveResultPlan {
    pub game_slug: String,
    pub mode: GameMode,
    pub status: ClaimedStatus,
    pub attempts: u32,
    pub time_spent_ms: u64,
    pub puzzle_id: String,
    pub puzzle_date: String,
    pub archive_date: Option<String>,
    pub difficulty: Option<String>,
}

/// Input bundle for [`plan_save_result`] (avoids too-many-arguments).
#[derive(Debug, Clone)]
pub struct SaveResultInput<'a> {
    pub game_slug: &'a str,
    pub status: &'a str,
    pub attempts: u32,
    pub time_spent_ms: u64,
    pub mode: Option<&'a str>,
    pub archive_date: Option<&'a str>,
    pub puzzle_id: &'a str,
    pub difficulty: Option<&'a str>,
    pub today: NaiveDate,
    pub already_played: bool,
}

/// Plan a save-result write after request parsing (parity preflight).
///
/// `already_played` is supplied by the caller (session store / DB lookup).
///
/// # Errors
///
/// Returns [`SaveResultError`] for invalid inputs or duplicate play.
pub fn plan_save_result(input: &SaveResultInput<'_>) -> Result<SaveResultPlan, SaveResultError> {
    if !is_valid_game_slug(input.game_slug) {
        return Err(SaveResultError::InvalidGameSlug);
    }
    let mode =
        GameMode::parse(input.mode.unwrap_or("daily")).ok_or(SaveResultError::InvalidMode)?;
    let status = ClaimedStatus::parse(input.status).ok_or(SaveResultError::InvalidStatus)?;
    if !status.is_validatable() {
        return Err(SaveResultError::AbandonedNotValidatable);
    }
    if input.puzzle_id.trim().is_empty() {
        return Err(SaveResultError::InvalidStatus);
    }
    let difficulty = map_session_difficulty(input.difficulty)
        .map_err(|_| SaveResultError::InvalidDifficulty)?
        .map(str::to_string);

    let (puzzle_date, archive_date) = match mode {
        GameMode::Archive => {
            let raw = input
                .archive_date
                .ok_or(SaveResultError::MissingArchiveDate)?;
            let d = parse_date_yyyy_mm_dd(raw).map_err(|_| SaveResultError::InvalidArchiveDate)?;
            if !is_valid_archive_date(d, input.today) {
                return Err(SaveResultError::InvalidArchiveDate);
            }
            let s = puzzle_date_string_utc(d);
            (s.clone(), Some(s))
        }
        GameMode::Daily | GameMode::Practice => (puzzle_date_string_utc(input.today), None),
    };

    if input.already_played && matches!(mode, GameMode::Daily | GameMode::Archive) {
        return Err(SaveResultError::AlreadyPlayed);
    }

    Ok(SaveResultPlan {
        game_slug: input.game_slug.to_string(),
        mode,
        status,
        attempts: input.attempts,
        time_spent_ms: input.time_spent_ms,
        puzzle_id: input.puzzle_id.to_string(),
        puzzle_date,
        archive_date,
        difficulty,
    })
}
