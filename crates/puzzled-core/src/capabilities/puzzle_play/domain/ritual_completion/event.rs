use chrono::NaiveDate;
use serde::{Deserialize, Serialize};

use super::super::game_slugs::{is_valid_game_slug, module_class_for, ModuleClass};

/// Terminal finish kind for a ritual run (event contract).
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum FinishKind {
    /// Server-validated success (`status = won`).
    Success,
    /// Honest terminal fail after rules exhaustion (`status = lost`).
    ExhaustedFail,
    /// Other terminal outcome reserved for future modules.
    OtherTerminal,
}

impl FinishKind {
    #[must_use]
    pub fn as_str(self) -> &'static str {
        match self {
            Self::Success => "success",
            Self::ExhaustedFail => "exhausted_fail",
            Self::OtherTerminal => "other_terminal",
        }
    }

    /// Map server session status labels to finish kind.
    #[must_use]
    pub fn from_session_status(status: &str) -> Option<Self> {
        match status.trim().to_ascii_lowercase().as_str() {
            "won" => Some(Self::Success),
            "lost" => Some(Self::ExhaustedFail),
            _ => None,
        }
    }
}

/// Server-authoritative ritual completion record (`ritual.completed` contract).
///
/// Persistence equivalent: `game_sessions` rows with `is_ritual = true`.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct RitualCompleted {
    pub user_id: String,
    pub game_module_id: String,
    /// `YYYY-MM-DD` in product day-key TZ (`Asia/Hong_Kong`).
    pub day_key: String,
    pub finish_kind: FinishKind,
    pub content_id: Option<String>,
    /// Unix epoch milliseconds (shell fills from clock).
    pub at_ms: i64,
    pub is_ritual: bool,
    pub module_class: ModuleClass,
}

/// Inputs required to decide whether a validated finish qualifies as a ritual.
#[derive(Debug, Clone, Copy)]
pub struct RitualQualifyInput<'a> {
    pub game_module_id: &'a str,
    /// Product mode after server resolution (`daily` | `archive` | `practice`).
    pub mode: &'a str,
    /// Server session status after validation (`won` | `lost` | …).
    pub status: &'a str,
    /// True for dry-run / admin inject / load-test markers (never daily puzzle completers).
    pub is_dry_run: bool,
}

/// Pure qualification: does this validated finish emit `ritual.completed`?
#[must_use]
pub fn qualifies_as_ritual(input: RitualQualifyInput<'_>) -> bool {
    if input.is_dry_run {
        return false;
    }
    if !is_valid_game_slug(input.game_module_id) {
        return false;
    }
    if !input.mode.trim().eq_ignore_ascii_case("daily") {
        return false;
    }
    if FinishKind::from_session_status(input.status).is_none() {
        return false;
    }
    matches!(
        module_class_for(input.game_module_id),
        Some(ModuleClass::PuzzleRitual)
    )
}

/// Build the event when qualification succeeds.
///
/// `day_key` must already be the **server** product day key (or the content
/// day for that ritual), never a client-supplied authority value.
#[must_use]
pub fn build_ritual_completed(
    user_id: impl Into<String>,
    game_module_id: &str,
    day_key: NaiveDate,
    status: &str,
    content_id: Option<String>,
    at_ms: i64,
) -> Option<RitualCompleted> {
    let finish_kind = FinishKind::from_session_status(status)?;
    let module_class = module_class_for(game_module_id)?;
    if !matches!(module_class, ModuleClass::PuzzleRitual) {
        return None;
    }
    Some(RitualCompleted {
        user_id: user_id.into(),
        game_module_id: game_module_id.to_string(),
        day_key: day_key.format("%Y-%m-%d").to_string(),
        finish_kind,
        content_id,
        at_ms,
        is_ritual: true,
        module_class,
    })
}
