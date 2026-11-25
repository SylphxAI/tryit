//! Application settings storage.

use serde_json::Value;
use sqlx::PgPool;
use uuid::Uuid;

pub async fn list_settings(pool: &PgPool) -> Result<Vec<Value>, String> {
    let rows: Vec<(String, Value, Option<String>, chrono::DateTime<chrono::Utc>)> = sqlx::query_as(
        r#"
        SELECT key, value, description, updated_at FROM app_settings ORDER BY key
        "#,
    )
    .fetch_all(pool)
    .await
    .map_err(|e| format!("settings list failed: {e}"))?;
    Ok(rows
        .into_iter()
        .map(|(key, value, description, updated_at)| {
            serde_json::json!({
                "key": key,
                "value": value,
                "description": description,
                "updatedAt": updated_at.to_rfc3339(),
            })
        })
        .collect())
}

pub async fn upsert_setting(
    pool: &PgPool,
    key: &str,
    value: &Value,
    actor_id: &str,
) -> Result<Value, String> {
    let actor = Uuid::parse_str(actor_id).map_err(|e| format!("invalid actor id: {e}"))?;
    sqlx::query(
        r#"
        INSERT INTO app_settings (key, value, updated_by, updated_at)
        VALUES ($1, $2, $3, now())
        ON CONFLICT (key) DO UPDATE SET value = $2, updated_by = $3, updated_at = now()
        "#,
    )
    .bind(key)
    .bind(value)
    .bind(actor)
    .execute(pool)
    .await
    .map_err(|e| format!("setting upsert failed: {e}"))?;
    Ok(serde_json::json!({ "key": key, "value": value }))
}
