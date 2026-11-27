use chrono::NaiveDate;
use connectrpc::{ConnectError, ErrorCode};
use uuid::Uuid;

use crate::bootstrap::identity::RequestAccess;
use crate::capabilities::puzzle_play::adapters::five_write_cohorts;

pub(super) async fn require_admitted(
    access: &mut RequestAccess,
    slug: &str,
    day: NaiveDate,
    puzzle_id: Option<&str>,
) -> Result<(), ConnectError> {
    if slug != "word-guess" {
        return Ok(());
    }
    let unavailable = || ConnectError::new(ErrorCode::Unavailable, "five_cohort_unavailable");
    let (connection, puzzle_id) = match (access.connection(), puzzle_id) {
        // The database-less developer path cannot resolve a registered puzzle.
        (None, None) => return Ok(()),
        (Some(connection), Some(id)) => {
            (connection, Uuid::parse_str(id).map_err(|_| unavailable())?)
        }
        _ => return Err(unavailable()),
    };
    match five_write_cohorts::admits(connection, day, puzzle_id).await {
        Ok(true) => Ok(()),
        Ok(false) => Err(ConnectError::new(
            ErrorCode::FailedPrecondition,
            "five_cohort_closed",
        )),
        Err(error) => {
            tracing::warn!(%error, "Five cohort lookup failed");
            Err(unavailable())
        }
    }
}
