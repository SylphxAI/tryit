//! Game session aggregates for admin reporting.

use serde_json::Value;
use sqlx::PgPool;

pub async fn games_overview(pool: &PgPool) -> Result<Vec<Value>, String> {
    let rows: Vec<(String, i64, i64, i64, i64)> = sqlx::query_as(
        r#"
        SELECT game_slug,
               COUNT(*) FILTER (WHERE completed_at::date = CURRENT_DATE) AS today_played,
               COUNT(*) FILTER (WHERE completed_at::date = CURRENT_DATE AND status = 'won') AS today_wins,
               COUNT(*) AS all_time_played,
               COUNT(*) FILTER (WHERE status = 'won') AS all_time_wins
        FROM game_sessions
        WHERE status IN ('won','lost')
        GROUP BY game_slug
        ORDER BY game_slug
        "#,
    )
    .fetch_all(pool)
    .await
    .map_err(|e| format!("games overview failed: {e}"))?;
    Ok(rows
        .into_iter()
        .map(|(slug, today_played, today_wins, all_played, all_wins)| {
            serde_json::json!({
                "slug": slug,
                "todayPlayed": today_played,
                "todayWins": today_wins,
                "allTimePlayed": all_played,
                "allTimeWins": all_wins,
            })
        })
        .collect())
}

/// Daily play/wins per day for a game over the last N days.
pub async fn game_analytics(
    pool: &PgPool,
    game_slug: &str,
    days: u32,
) -> Result<Vec<serde_json::Value>, String> {
    let days = days.clamp(1, 365) as i64;
    let rows: Vec<(chrono::NaiveDate, i64, i64, f64)> = sqlx::query_as(
        r#"
        SELECT completed_at::date AS day,
               COUNT(*) AS games_played,
               COUNT(*) FILTER (WHERE status = 'won') AS wins,
               COALESCE(AVG(attempts), 0)::float8 AS avg_attempts
        FROM game_sessions
        WHERE game_slug = $1
          AND status IN ('won','lost')
          AND completed_at >= now() - ($2 * INTERVAL '1 day')
        GROUP BY completed_at::date
        ORDER BY completed_at::date
        "#,
    )
    .bind(game_slug)
    .bind(days)
    .fetch_all(pool)
    .await
    .map_err(|e| format!("game analytics failed: {e}"))?;
    Ok(rows
        .into_iter()
        .map(|(day, played, wins, avg)| {
            serde_json::json!({
                "date": day.format("%Y-%m-%d").to_string(),
                "gamesPlayed": played,
                "wins": wins,
                "avgAttempts": avg,
            })
        })
        .collect())
}
