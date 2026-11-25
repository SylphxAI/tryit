use chrono::NaiveDate;
use connectrpc::{ConnectError, ErrorCode};
use serde_json::Value;
use tracing::warn;

use super::{PuzzleConnectService, TRACE_TARGET};
use crate::capabilities::daily_pipeline;
use crate::capabilities::puzzle_play::adapters::daily_puzzles_db::fetch_puzzle_by_id;

/// The authoritative board and answer used to validate a final submission.
pub(super) struct SubmissionPuzzle {
    pub(super) puzzle_data: Value,
    pub(super) solution: Value,
    pub(super) resolved_id: Option<String>,
}

impl PuzzleConnectService {
    pub(super) async fn resolve_submission_puzzle(
        &self,
        puzzle_id: Option<&str>,
        game_slug: &str,
        date: NaiveDate,
        difficulty: Option<&str>,
    ) -> Result<SubmissionPuzzle, ConnectError> {
        // The served puzzle: the stored row by id, else the day's stored
        // puzzle (generated and stored on a miss). The client's seed is never
        // authority.
        let (puzzle_data, solution, resolved_id) = match (puzzle_id, &self.state.pool) {
            (Some(pid), Some(pool)) => match fetch_puzzle_by_id(pool, pid).await {
                Ok(Some(p)) if p.puzzle_date != date => {
                    return Err(ConnectError::new(
                        ErrorCode::InvalidArgument,
                        "puzzle_date_mismatch",
                    ));
                }
                Ok(Some(p)) if p.game_slug == game_slug => {
                    (p.puzzle_data, p.solution, Some(p.id.to_string()))
                }
                Ok(Some(_)) => {
                    return Err(ConnectError::new(
                        ErrorCode::InvalidArgument,
                        "puzzle_game_slug_mismatch",
                    ));
                }
                Ok(None) => {
                    return Err(ConnectError::new(ErrorCode::NotFound, "puzzle_unavailable"));
                }
                Err(error) => {
                    warn!(target: TRACE_TARGET, %error, "submit puzzle lookup failed");
                    return Err(ConnectError::new(
                        ErrorCode::Internal,
                        "puzzle_lookup_failed",
                    ));
                }
            },
            _ => {
                match daily_pipeline::resolve(self.state.pool.as_ref(), game_slug, date, difficulty)
                    .await
                {
                    Ok(found) => (found.puzzle_data, Some(found.solution), found.id),
                    Err(error) => {
                        warn!(target: TRACE_TARGET, %error, "submit puzzle unavailable");
                        return Err(ConnectError::new(ErrorCode::NotFound, "puzzle_unavailable"));
                    }
                }
            }
        };

        let Some(solution) = solution else {
            return Err(ConnectError::new(
                ErrorCode::Unavailable,
                "puzzle_solution_unavailable",
            ));
        };
        Ok(SubmissionPuzzle {
            puzzle_data,
            solution,
            resolved_id,
        })
    }
}
