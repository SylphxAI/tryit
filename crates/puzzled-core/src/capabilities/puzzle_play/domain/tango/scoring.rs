use super::solution::is_solved;
use super::types::{CellValue, GameResult, SubmissionStatus};

/// Base score for a win before time penalty.
pub const BASE_WIN_SCORE: u32 = 500;
/// Floor score for a win.
pub const MIN_WIN_SCORE: u32 = 100;

/// Score: `max(100, 500 - floor(seconds/2))`.
#[must_use]
pub fn tango_score(time_spent_ms: u64) -> u32 {
    let seconds = time_spent_ms / 1000;
    let time_penalty = (seconds / 2) as u32;
    BASE_WIN_SCORE
        .saturating_sub(time_penalty)
        .max(MIN_WIN_SCORE)
}

/// Validate claimed win/loss; optionally require exact solution match on win.
#[must_use]
pub fn validate_and_score(
    submitted: Option<&[Vec<CellValue>]>,
    solution: Option<&[Vec<CellValue>]>,
    time_spent_ms: u64,
    claimed: SubmissionStatus,
) -> GameResult {
    let Some(grid) = submitted else {
        return GameResult::Invalid {
            error: "Missing grid data".into(),
        };
    };

    let solved = is_solved(grid);

    if claimed == SubmissionStatus::Won && !solved {
        return GameResult::Invalid {
            error: "Puzzle not correctly solved".into(),
        };
    }

    if claimed == SubmissionStatus::Won {
        if let Some(sol) = solution {
            if grid.len() != sol.len() {
                return GameResult::Invalid {
                    error: "Solution mismatch".into(),
                };
            }
            for r in 0..grid.len() {
                if grid[r].len() != sol[r].len() {
                    return GameResult::Invalid {
                        error: "Solution mismatch".into(),
                    };
                }
                for c in 0..grid[r].len() {
                    if grid[r][c] != sol[r][c] {
                        return GameResult::Invalid {
                            error: "Solution mismatch".into(),
                        };
                    }
                }
            }
        }
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
        score: tango_score(time_spent_ms),
    }
}
