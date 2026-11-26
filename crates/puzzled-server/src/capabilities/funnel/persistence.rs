use sqlx::PgPool;

use super::Row;

pub async fn insert(pool: &PgPool, row: &Row) -> Result<(), String> {
    sqlx::query(
        r#"INSERT INTO "funnel_events" ("id", "event", "path", "game_slug", "metric", "value", "rating", "params")
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8)"#,
    )
    .bind(uuid::Uuid::now_v7())
    .bind(row.event)
    .bind(&row.path)
    .bind(&row.game_slug)
    .bind(row.metric)
    .bind(row.value)
    .bind(row.rating)
    .bind(&row.params)
    .execute(pool)
    .await
    .map_err(|e| format!("funnel event insert failed: {e}"))?;
    Ok(())
}

/// A new account. Best effort: a failure is logged by the caller, never surfaced.
pub async fn record_signup(pool: &PgPool, user_id: &str) -> Result<(), String> {
    let user_id = uuid::Uuid::parse_str(user_id).map_err(|e| e.to_string())?;
    // The receipt and anonymous event commit together; retries/concurrent calls
    // cannot inflate signup counts and a failed insert leaves the call retryable.
    sqlx::query(
        r#"WITH first_signup AS (
            INSERT INTO funnel_signup_receipts (user_id) SELECT $1 WHERE NOT EXISTS (SELECT 1 FROM synthetic_fixtures WHERE user_id=$1)
            ON CONFLICT DO NOTHING RETURNING user_id
        ) INSERT INTO funnel_events (id, event) SELECT $2, 'signup' FROM first_signup"#,
    )
    .bind(user_id)
    .bind(uuid::Uuid::now_v7())
    .execute(pool)
    .await
    .map_err(|e| format!("funnel signup insert failed: {e}"))?;
    Ok(())
}
