//! Game modes, claimed outcomes, and route difficulty labels.

use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum GameMode {
    Daily,
    Archive,
    Practice,
}

impl GameMode {
    #[must_use]
    pub fn parse(raw: &str) -> Option<Self> {
        match raw {
            "daily" => Some(Self::Daily),
            "archive" => Some(Self::Archive),
            "practice" => Some(Self::Practice),
            _ => None,
        }
    }

    #[must_use]
    pub fn as_str(self) -> &'static str {
        match self {
            Self::Daily => "daily",
            Self::Archive => "archive",
            Self::Practice => "practice",
        }
    }
}

/// Client-claimed result status (parity: `GAME_RESULT_STATUSES`).
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum ClaimedStatus {
    Won,
    Lost,
    Abandoned,
}

impl ClaimedStatus {
    #[must_use]
    pub fn parse(raw: &str) -> Option<Self> {
        match raw {
            "won" => Some(Self::Won),
            "lost" => Some(Self::Lost),
            "abandoned" => Some(Self::Abandoned),
            _ => None,
        }
    }

    #[must_use]
    pub fn as_str(self) -> &'static str {
        match self {
            Self::Won => "won",
            Self::Lost => "lost",
            Self::Abandoned => "abandoned",
        }
    }

    /// Abandoned cannot be server-validated (TS parity).
    #[must_use]
    pub fn is_validatable(self) -> bool {
        !matches!(self, Self::Abandoned)
    }
}

/// Puzzle difficulty labels accepted by games routes.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum RouteDifficulty {
    Easy,
    Medium,
    Hard,
    Expert,
}

impl RouteDifficulty {
    #[must_use]
    pub fn parse(raw: &str) -> Option<Self> {
        match raw {
            "easy" => Some(Self::Easy),
            "medium" => Some(Self::Medium),
            "hard" => Some(Self::Hard),
            "expert" => Some(Self::Expert),
            _ => None,
        }
    }

    #[must_use]
    pub fn as_str(self) -> &'static str {
        match self {
            Self::Easy => "easy",
            Self::Medium => "medium",
            Self::Hard => "hard",
            Self::Expert => "expert",
        }
    }

    /// Expert maps to NULL difficulty in DB (TS parity).
    #[must_use]
    pub fn db_difficulty(self) -> Option<&'static str> {
        match self {
            Self::Easy => Some("easy"),
            Self::Medium => Some("medium"),
            Self::Hard => Some("hard"),
            Self::Expert => None,
        }
    }
}

/// Map optional difficulty string for session uniqueness (TS save-result).
///
/// # Errors
///
/// Returns an error string when the difficulty label is unknown.
pub fn map_session_difficulty(raw: Option<&str>) -> Result<Option<&'static str>, String> {
    match raw {
        None => Ok(None),
        Some(s) => {
            let d = RouteDifficulty::parse(s).ok_or_else(|| format!("invalid difficulty: {s}"))?;
            Ok(d.db_difficulty())
        }
    }
}
