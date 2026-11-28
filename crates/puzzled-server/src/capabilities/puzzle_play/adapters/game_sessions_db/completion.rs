//! Lookups for accepted puzzle results and ritual finishes.

use sqlx::PgPool;

use super::parse_user_id;

// Completion existence probes. Postgres types bare `SELECT 1` as INT4; decoding
// that as Rust `i64` (INT8) fails with session_lookup_failed (live dogfood on
// tip 626f40a). Use EXISTS → bool (preferred) or `1::bigint` if a scalar int is
// required. These SQL strings are the regression oracle for that mismatch.
const HAS_COMPLETED_BY_PID_AND_DATE_SQL: &str = r#"
SELECT EXISTS (
  SELECT 1 FROM game_sessions
  WHERE user_id = $1
    AND status IN ('won','lost')
    AND (
      puzzle_id = $2
      OR (game_slug = $3 AND puzzle_date = $4)
    )
)
"#;

const HAS_COMPLETED_BY_PID_SQL: &str = r#"
SELECT EXISTS (
  SELECT 1 FROM game_sessions
  WHERE user_id = $1 AND puzzle_id = $2 AND status IN ('won','lost')
)
"#;

const HAS_COMPLETED_BY_DATE_SQL: &str = r#"
SELECT EXISTS (
  SELECT 1 FROM game_sessions
  WHERE user_id = $1 AND game_slug = $2 AND puzzle_date = $3
    AND status IN ('won','lost')
)
"#;

const HAS_RITUAL_COMPLETION_SQL: &str = r#"
SELECT EXISTS (
  SELECT 1 FROM game_sessions
  WHERE user_id = $1
    AND game_slug = $2
    AND day_key = $3
    AND is_ritual = true
    AND status IN ('won','lost')
)
"#;

const COMPLETED_SESSION_BY_PID_AND_DATE_SQL: &str = r#"
SELECT status::text, score, attempts, completed_at, difficulty::text, time_spent_ms
FROM game_sessions
WHERE user_id = $1
  AND status IN ('won','lost')
  AND (
    puzzle_id = $2
    OR (game_slug = $3 AND puzzle_date = $4)
  )
ORDER BY completed_at DESC NULLS LAST, id DESC
LIMIT 1
"#;

const COMPLETED_SESSION_BY_PID_SQL: &str = r#"
SELECT status::text, score, attempts, completed_at, difficulty::text, time_spent_ms
FROM game_sessions
WHERE user_id = $1
  AND puzzle_id = $2
  AND status IN ('won','lost')
ORDER BY completed_at DESC NULLS LAST, id DESC
LIMIT 1
"#;

const COMPLETED_SESSION_BY_DATE_SQL: &str = r#"
SELECT status::text, score, attempts, completed_at, difficulty::text, time_spent_ms
FROM game_sessions
WHERE user_id = $1
  AND game_slug = $2
  AND puzzle_date = $3
  AND status IN ('won','lost')
ORDER BY completed_at DESC NULLS LAST, id DESC
LIMIT 1
"#;

/// True when the user has a completed session for the given puzzle and/or date.
///
/// Lookup is **OR** of:
/// - `puzzle_id` when the served puzzle has a stable store id
/// - `(game_slug, puzzle_date)` for date-keyed dailies (including deterministic
///   sudoku with no `daily_puzzles` row / null `puzzle_id` on the session)
///
/// Free daily one-finish-per-module requires the date arm even when
/// `puzzle_id` is unresolved — otherwise a second SubmitGuess inserts another
/// `game_sessions` row (dogfood: dual wins same user/day with null puzzle_id).
pub async fn has_completed_session(
    pool: &PgPool,
    user_id: &str,
    game_slug: &str,
    puzzle_date: Option<chrono::NaiveDate>,
    puzzle_id: Option<&str>,
) -> Result<bool, String> {
    let mut tx = pool.begin().await.map_err(|e| e.to_string())?;
    let value =
        has_completed_session_on_connection(&mut tx, user_id, game_slug, puzzle_date, puzzle_id)
            .await?;
    tx.commit().await.map_err(|e| e.to_string())?;
    Ok(value)
}

pub async fn has_completed_session_on_connection(
    connection: &mut sqlx::PgConnection,
    user_id: &str,
    game_slug: &str,
    puzzle_date: Option<chrono::NaiveDate>,
    puzzle_id: Option<&str>,
) -> Result<bool, String> {
    let uid = parse_user_id(user_id)?;
    let pid = match puzzle_id {
        Some(p) => Some(uuid::Uuid::parse_str(p).map_err(|e| format!("invalid puzzle id: {e}"))?),
        None => None,
    };
    let date = match puzzle_date {
        Some(d) => Some(d.and_hms_opt(0, 0, 0).ok_or("invalid date")?),
        None => None,
    };
    let exists: bool = match (pid, date) {
        (Some(pid), Some(date)) => sqlx::query_scalar::<_, bool>(HAS_COMPLETED_BY_PID_AND_DATE_SQL)
            .bind(uid)
            .bind(pid)
            .bind(game_slug)
            .bind(date)
            .fetch_one(&mut *connection)
            .await
            .map_err(|e| format!("game_sessions query failed: {e}"))?,
        (Some(pid), None) => sqlx::query_scalar::<_, bool>(HAS_COMPLETED_BY_PID_SQL)
            .bind(uid)
            .bind(pid)
            .fetch_one(&mut *connection)
            .await
            .map_err(|e| format!("game_sessions query failed: {e}"))?,
        (None, Some(date)) => sqlx::query_scalar::<_, bool>(HAS_COMPLETED_BY_DATE_SQL)
            .bind(uid)
            .bind(game_slug)
            .bind(date)
            .fetch_one(&mut *connection)
            .await
            .map_err(|e| format!("game_sessions query failed: {e}"))?,
        (None, None) => false,
    };
    Ok(exists)
}

pub(crate) type CompletedRow = (
    String,
    Option<i32>,
    i32,
    Option<chrono::NaiveDateTime>,
    Option<String>,
    Option<i32>,
);

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct CompletedSession {
    pub status: String,
    pub score: Option<i32>,
    pub attempts: i32,
    pub completed_at: Option<chrono::NaiveDateTime>,
    /// The level the accepted finish was played at; `None` for games without levels.
    pub difficulty: Option<String>,
    pub time_spent_ms: Option<i32>,
}

/// Load the accepted result for a served daily puzzle.
///
/// This is deliberately the same identity/date-or-puzzle lookup as
/// [`has_completed_session`]. The result card must reflect the Rust-accepted
/// `game_sessions` row; it must never be inferred from the completion boolean
/// or filled with client/current-time defaults.
pub async fn load_completed_session(
    pool: &PgPool,
    user_id: &str,
    game_slug: &str,
    puzzle_date: Option<chrono::NaiveDate>,
    puzzle_id: Option<&str>,
) -> Result<Option<CompletedSession>, String> {
    let mut tx = pool.begin().await.map_err(|e| e.to_string())?;
    let value =
        load_completed_session_on_connection(&mut tx, user_id, game_slug, puzzle_date, puzzle_id)
            .await?;
    tx.commit().await.map_err(|e| e.to_string())?;
    Ok(value)
}

pub async fn load_completed_session_on_connection(
    connection: &mut sqlx::PgConnection,
    user_id: &str,
    game_slug: &str,
    puzzle_date: Option<chrono::NaiveDate>,
    puzzle_id: Option<&str>,
) -> Result<Option<CompletedSession>, String> {
    let uid = parse_user_id(user_id)?;
    let pid = match puzzle_id {
        Some(p) => Some(uuid::Uuid::parse_str(p).map_err(|e| format!("invalid puzzle id: {e}"))?),
        None => None,
    };
    let date = match puzzle_date {
        Some(d) => Some(d.and_hms_opt(0, 0, 0).ok_or("invalid date")?),
        None => None,
    };

    let row: Option<CompletedRow> = match (pid, date) {
        (Some(pid), Some(date)) => sqlx::query_as(COMPLETED_SESSION_BY_PID_AND_DATE_SQL)
            .bind(uid)
            .bind(pid)
            .bind(game_slug)
            .bind(date)
            .fetch_optional(&mut *connection)
            .await
            .map_err(|e| format!("completed session query failed: {e}"))?,
        (Some(pid), None) => sqlx::query_as(COMPLETED_SESSION_BY_PID_SQL)
            .bind(uid)
            .bind(pid)
            .fetch_optional(&mut *connection)
            .await
            .map_err(|e| format!("completed session query failed: {e}"))?,
        (None, Some(date)) => sqlx::query_as(COMPLETED_SESSION_BY_DATE_SQL)
            .bind(uid)
            .bind(game_slug)
            .bind(date)
            .fetch_optional(&mut *connection)
            .await
            .map_err(|e| format!("completed session query failed: {e}"))?,
        (None, None) => None,
    };

    Ok(row.map(CompletedSession::from))
}

impl From<CompletedRow> for CompletedSession {
    fn from(
        (status, score, attempts, completed_at, difficulty, time_spent_ms): CompletedRow,
    ) -> Self {
        Self {
            status,
            score,
            attempts,
            completed_at,
            difficulty,
            time_spent_ms,
        }
    }
}

/// True when the user already has a ritual finish for this module on `day_key`.
///
/// Complements [`has_completed_session`] for the free-daily path when sessions
/// may have been written with null `puzzle_id` (deterministic generator).
pub async fn has_ritual_completion(
    pool: &PgPool,
    user_id: &str,
    game_slug: &str,
    day_key: chrono::NaiveDate,
) -> Result<bool, String> {
    let mut tx = pool.begin().await.map_err(|e| e.to_string())?;
    let value = has_ritual_completion_on_connection(&mut tx, user_id, game_slug, day_key).await?;
    tx.commit().await.map_err(|e| e.to_string())?;
    Ok(value)
}

pub async fn has_ritual_completion_on_connection(
    connection: &mut sqlx::PgConnection,
    user_id: &str,
    game_slug: &str,
    day_key: chrono::NaiveDate,
) -> Result<bool, String> {
    let uid = parse_user_id(user_id)?;
    let day = day_key.format("%Y-%m-%d").to_string();
    let exists: bool = sqlx::query_scalar::<_, bool>(HAS_RITUAL_COMPLETION_SQL)
        .bind(uid)
        .bind(game_slug)
        .bind(day)
        .fetch_one(&mut *connection)
        .await
        .map_err(|e| format!("game_sessions ritual query failed: {e}"))?;
    Ok(exists)
}
