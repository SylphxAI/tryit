//! Daily status and archive access and calendar flows.

use chrono::NaiveDate;
use serde::{Deserialize, Serialize};
use serde_json::Value;

use super::types::RouteDifficulty;
use crate::capabilities::puzzle_play::daily_time::{
    expand_archive_dates, get_puzzle_number, is_valid_archive_date, parse_date_yyyy_mm_dd,
    puzzle_date_string_utc,
};
use crate::capabilities::puzzle_play::game_slugs::is_valid_game_slug;

/// Daily-status response envelope (puzzle materialization residual when null).
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DailyStatusResponse {
    pub has_completed: bool,
    pub completed_session: Option<Value>,
    pub puzzle: DailyPuzzleMeta,
    pub can_play: bool,
    pub mode: &'static str,
    pub slice: &'static str,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DailyPuzzleMeta {
    pub id: Option<String>,
    pub puzzle_number: u32,
    pub puzzle_date: String,
    pub puzzle_data: Option<Value>,
    pub difficulty: Option<String>,
}

/// Build daily-status envelope (pure).
///
/// # Errors
///
/// Returns HTTP-like status codes 404/400 for invalid inputs (shell maps to status_code).
pub fn build_daily_status(
    game_slug: &str,
    today: NaiveDate,
    difficulty: Option<&str>,
    completed_session: Option<Value>,
    puzzle_id: Option<String>,
    puzzle_data: Option<Value>,
) -> Result<DailyStatusResponse, u16> {
    if !is_valid_game_slug(game_slug) {
        return Err(404);
    }
    if let Some(d) = difficulty {
        if RouteDifficulty::parse(d).is_none() {
            return Err(400);
        }
    }
    let has_completed = completed_session.is_some();
    Ok(DailyStatusResponse {
        has_completed,
        completed_session,
        puzzle: DailyPuzzleMeta {
            id: puzzle_id,
            puzzle_number: get_puzzle_number(today, None),
            puzzle_date: puzzle_date_string_utc(today),
            puzzle_data,
            difficulty: difficulty.map(str::to_string),
        },
        can_play: !has_completed,
        mode: "daily",
        slice: "api-v1-hono-monolith",
    })
}

/// Archive access policy (premium + past date).
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum ArchiveAccessError {
    NotPremium,
    UnknownGame,
    InvalidDate,
    FutureOrToday,
    AlreadyPlayed,
}

impl ArchiveAccessError {
    #[must_use]
    pub fn message(&self) -> &'static str {
        match self {
            Self::NotPremium => "Archive access requires premium subscription",
            Self::UnknownGame => "Unknown game",
            Self::InvalidDate => "Invalid date",
            Self::FutureOrToday => "Cannot access future puzzles",
            Self::AlreadyPlayed => "Already played this archive puzzle",
        }
    }

    #[must_use]
    pub fn status_code(&self) -> u16 {
        match self {
            Self::NotPremium => 403,
            Self::UnknownGame => 404,
            Self::AlreadyPlayed => 409,
            _ => 400,
        }
    }
}

/// Validate archive-puzzle access (pure).
///
/// # Errors
///
/// Returns [`ArchiveAccessError`] when policy rejects the request.
pub fn check_archive_access(
    game_slug: &str,
    date: &str,
    today: NaiveDate,
    is_premium: bool,
    already_played: bool,
) -> Result<NaiveDate, ArchiveAccessError> {
    if !is_premium {
        return Err(ArchiveAccessError::NotPremium);
    }
    if !is_valid_game_slug(game_slug) {
        return Err(ArchiveAccessError::UnknownGame);
    }
    let d = parse_date_yyyy_mm_dd(date).map_err(|_| ArchiveAccessError::InvalidDate)?;
    if !is_valid_archive_date(d, today) {
        return Err(ArchiveAccessError::FutureOrToday);
    }
    if already_played {
        return Err(ArchiveAccessError::AlreadyPlayed);
    }
    Ok(d)
}

/// Build archive-dates calendar with played flags (pure).
#[must_use]
pub fn build_archive_dates(
    start: NaiveDate,
    end: NaiveDate,
    today: NaiveDate,
    played: &[NaiveDate],
) -> Vec<ArchiveDateEntry> {
    expand_archive_dates(start, end, today)
        .into_iter()
        .map(|d| ArchiveDateEntry {
            date: puzzle_date_string_utc(d),
            played: played.contains(&d),
        })
        .collect()
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ArchiveDateEntry {
    pub date: String,
    pub played: bool,
}
