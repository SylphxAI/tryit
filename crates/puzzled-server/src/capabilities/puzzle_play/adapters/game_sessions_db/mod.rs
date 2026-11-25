//! SQL adapter for puzzle-play game session persistence.
//!
//! Ritual completion (`ritual.completed` equivalent) is stored on the same
//! authoritative `game_sessions` row written after server validation — no dual
//! instrumentation path.

use puzzled_core::identity_policy::guest_day_id::user_id_to_storage_uuid;

mod completion;
mod guest_adoption;
mod persistence;
mod progress;

pub use completion::{
    has_completed_session, has_completed_session_on_connection, has_ritual_completion,
    has_ritual_completion_on_connection, load_completed_session,
    load_completed_session_on_connection, CompletedSession,
};
pub use guest_adoption::{
    adopt_guest_sessions, adopt_guest_sessions_on_connection, reassign_sessions,
};
pub use persistence::{
    persist_game_session, persist_validated_session, persist_validated_session_on_connection,
    PersistGameSessionInput, ValidatedSession,
};
pub use progress::{
    count_sessions, count_sessions_on_connection, load_today_progress,
    load_today_progress_on_connection, recompute_drc,
};

/// Parse Platform `sub` or logical `guest_<uuid>` into the uuid column value.
fn parse_user_id(user_id: &str) -> Result<uuid::Uuid, String> {
    user_id_to_storage_uuid(user_id).ok_or_else(|| format!("invalid user id: {user_id}"))
}

#[cfg(test)]
mod tests;
