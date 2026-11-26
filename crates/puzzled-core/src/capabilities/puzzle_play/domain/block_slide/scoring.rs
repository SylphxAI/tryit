use super::types::{GameResult, SubmissionStatus};

/// Base score for an optimal win.
pub const BASE_WIN_SCORE: u32 = 500;
/// Floor score for a win.
pub const MIN_WIN_SCORE: u32 = 100;
/// Penalty per extra move beyond minMoves.
pub const EXTRA_MOVE_PENALTY: u32 = 5;
/// Bonus when solved under 60 seconds.
pub const FAST_SOLVE_BONUS: u32 = 50;
/// Fast-solve threshold (ms) — mirrors `MINUTE_MS`.
pub const FAST_SOLVE_MS: u64 = 60_000;

/// Score: `max(100, 500 - extra*5 + (time < 60s ? 50 : 0))`.
#[must_use]
pub fn block_slide_score(min_moves: u32, move_count: u32, time_spent_ms: u64) -> u32 {
    let extra = move_count.saturating_sub(min_moves);
    let move_penalty = extra.saturating_mul(EXTRA_MOVE_PENALTY);
    let time_bonus = if time_spent_ms < FAST_SOLVE_MS {
        FAST_SOLVE_BONUS
    } else {
        0
    };
    BASE_WIN_SCORE
        .saturating_sub(move_penalty)
        .saturating_add(time_bonus)
        .max(MIN_WIN_SCORE)
}

/// Validate claimed win/loss + moveCount against solution.minMoves; score wins.
#[must_use]
pub fn validate_and_score(
    min_moves: u32,
    move_count: Option<u32>,
    time_spent_ms: u64,
    claimed: SubmissionStatus,
) -> GameResult {
    if claimed == SubmissionStatus::Lost {
        return GameResult::Valid {
            status: SubmissionStatus::Lost,
            score: 0,
        };
    }

    let Some(move_count) = move_count else {
        return GameResult::Invalid {
            error: "Missing move count data".into(),
        };
    };

    if move_count < min_moves {
        return GameResult::Invalid {
            error: format!("Impossible: solved in {move_count} moves, minimum is {min_moves}"),
        };
    }

    GameResult::Valid {
        status: SubmissionStatus::Won,
        score: block_slide_score(min_moves, move_count, time_spent_ms),
    }
}
