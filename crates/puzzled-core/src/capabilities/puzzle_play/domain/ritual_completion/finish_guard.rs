use super::super::game_slugs::{is_valid_game_slug, module_class_for, ModuleClass};
use super::metrics::RitualCompletionRow;

/// Product floor: free daily ritual admits **one** terminal finish per
/// `(user_id, game_module_id, day_key)` — independent of whether a stable
/// `puzzle_id` / content store row exists.
///
/// Shell enforces this via session pre-check + partial unique index; this pure
/// helper is the decision contract (and regression oracle for dogfood).
#[must_use]
pub fn ritual_already_finished(
    prior: &[RitualCompletionRow],
    user_id: &str,
    day_key: &str,
    game_module_id: &str,
) -> bool {
    if !is_valid_game_slug(game_module_id) {
        return false;
    }
    if !matches!(
        module_class_for(game_module_id),
        Some(ModuleClass::PuzzleRitual)
    ) {
        return false;
    }
    prior.iter().any(|r| {
        r.is_ritual
            && r.user_id == user_id
            && r.day_key == day_key
            && matches!(r.module_class, ModuleClass::PuzzleRitual)
    })
}

/// Whether SubmitGuess must run a completion pre-check for this resolve path.
///
/// Always true when a DB is available and a content day is known — **including**
/// when `resolved_puzzle_id` is `None` (deterministic sudoku). The historical
/// bug only gated on `resolved_puzzle_id.is_some()`.
#[must_use]
pub fn submit_must_guard_already_played(
    has_session_store: bool,
    resolved_puzzle_id: Option<&str>,
    content_day_known: bool,
) -> bool {
    let _ = resolved_puzzle_id; // intentionally unused — guard is not pid-gated
    has_session_store && content_day_known
}
