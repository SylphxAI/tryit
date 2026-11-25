//! Daily progress, completed-session counts and daily puzzle completers.

use sqlx::PgPool;

use puzzled_core::puzzle_play::ritual_completion::DRC_RECOMPUTE_SQL;

use super::{parse_user_id, CompletedSession};

type TodayProgressRow = (
    String,
    String,
    Option<i32>,
    i32,
    Option<chrono::NaiveDateTime>,
    Option<String>,
    Option<i32>,
);

const TODAY_PROGRESS_SQL: &str = r#"
SELECT DISTINCT ON (game_slug) game_slug, status::text, score, attempts, completed_at,
       difficulty::text, time_spent_ms
FROM game_sessions
WHERE user_id = $1
  AND game_slug = ANY($2)
  AND puzzle_date = $3
  AND status IN ('won','lost')
ORDER BY game_slug, completed_at DESC NULLS LAST, id DESC
"#;

/// Accepted finishes for one product day across many games in a single query,
/// keyed by game slug. Same date arm and ordering as [`load_completed_session`](super::load_completed_session),
/// so the one-finish-per-(user, game, day) reading is identical.
pub async fn load_today_progress(
    pool: &PgPool,
    user_id: &str,
    game_slugs: &[String],
    puzzle_date: chrono::NaiveDate,
) -> Result<std::collections::HashMap<String, CompletedSession>, String> {
    let mut tx = pool.begin().await.map_err(|e| e.to_string())?;
    let value =
        load_today_progress_on_connection(&mut tx, user_id, game_slugs, puzzle_date).await?;
    tx.commit().await.map_err(|e| e.to_string())?;
    Ok(value)
}

pub async fn load_today_progress_on_connection(
    connection: &mut sqlx::PgConnection,
    user_id: &str,
    game_slugs: &[String],
    puzzle_date: chrono::NaiveDate,
) -> Result<std::collections::HashMap<String, CompletedSession>, String> {
    let uid = parse_user_id(user_id)?;
    let date = puzzle_date.and_hms_opt(0, 0, 0).ok_or("invalid date")?;
    let rows: Vec<TodayProgressRow> = sqlx::query_as(TODAY_PROGRESS_SQL)
        .bind(uid)
        .bind(game_slugs)
        .bind(date)
        .fetch_all(&mut *connection)
        .await
        .map_err(|e| format!("today progress query failed: {e}"))?;
    Ok(rows
        .into_iter()
        .map(
            |(slug, status, score, attempts, completed_at, difficulty, time_spent_ms)| {
                (
                    slug,
                    CompletedSession {
                        status,
                        score,
                        attempts,
                        completed_at,
                        difficulty,
                        time_spent_ms,
                    },
                )
            },
        )
        .collect())
}

/// Count a user's completed sessions (any game).
pub async fn count_sessions(pool: &PgPool, user_id: &str) -> Result<u32, String> {
    let mut tx = pool.begin().await.map_err(|e| e.to_string())?;
    let value = count_sessions_on_connection(&mut tx, user_id).await?;
    tx.commit().await.map_err(|e| e.to_string())?;
    Ok(value)
}

pub async fn count_sessions_on_connection(
    connection: &mut sqlx::PgConnection,
    user_id: &str,
) -> Result<u32, String> {
    let uid = parse_user_id(user_id)?;
    let row: (i64,) = sqlx::query_as(
        "SELECT COUNT(*) FROM game_sessions WHERE user_id = $1 AND status IN ('won','lost')",
    )
    .bind(uid)
    .fetch_one(&mut *connection)
    .await
    .map_err(|e| format!("session count failed: {e}"))?;
    Ok(row.0.max(0) as u32)
}

/// Recompute daily puzzle completers for a product day_key from `game_sessions` (live oracle).
pub async fn recompute_drc(pool: &PgPool, day_key: &str) -> Result<u64, String> {
    let row: (i64,) = sqlx::query_as(DRC_RECOMPUTE_SQL)
        .bind(day_key)
        .fetch_one(pool)
        .await
        .map_err(|e| format!("drc recompute failed: {e}"))?;
    Ok(row.0.max(0) as u64)
}
