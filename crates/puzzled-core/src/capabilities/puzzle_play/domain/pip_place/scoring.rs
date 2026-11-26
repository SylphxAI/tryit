use super::rules::is_solved;
use super::types::{GameResult, Puzzle, SubmissionStatus, Tile};

/// Base score for a win before time penalty.
pub const BASE_WIN_SCORE: u32 = 500;
/// Floor score for a win.
pub const MIN_WIN_SCORE: u32 = 100;

/// Score: `max(100, 500 - floor(seconds/2))`.
#[must_use]
pub fn pip_place_score(time_spent_ms: u64) -> u32 {
    let seconds = time_spent_ms / 1000;
    let time_penalty = (seconds / 2) as u32;
    BASE_WIN_SCORE
        .saturating_sub(time_penalty)
        .max(MIN_WIN_SCORE)
}

/// Validate claimed win/loss against region constraints. Stored seed tiles are not used.
#[must_use]
pub fn validate_and_score(
    tiles: Option<&[Tile]>,
    puzzle: &Puzzle,
    time_spent_ms: u64,
    claimed: SubmissionStatus,
) -> GameResult {
    let Some(tiles) = tiles else {
        return GameResult::Invalid {
            error: "Missing tiles".into(),
        };
    };

    let solved = is_solved(tiles, puzzle);

    if claimed == SubmissionStatus::Won && !solved {
        return GameResult::Invalid {
            error: "Puzzle not correctly solved".into(),
        };
    }
    if claimed == SubmissionStatus::Lost && solved {
        return GameResult::Invalid {
            error: "Invalid loss claim - puzzle is solved".into(),
        };
    }
    if !solved {
        return GameResult::Valid {
            status: SubmissionStatus::Lost,
            score: 0,
        };
    }

    GameResult::Valid {
        status: SubmissionStatus::Won,
        score: pip_place_score(time_spent_ms),
    }
}
