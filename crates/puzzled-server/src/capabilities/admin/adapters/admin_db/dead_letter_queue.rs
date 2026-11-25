//! Dead-letter queue reads and status updates.

use serde_json::Value;
use sqlx::PgPool;
use uuid::Uuid;

type DlqRow = (
    Uuid,
    String,
    Option<Value>,
    String,
    i32,
    String,
    chrono::DateTime<chrono::Utc>,
    Option<chrono::DateTime<chrono::Utc>>,
);

pub async fn list_dlq(
    pool: &PgPool,
    limit: u32,
    offset: u32,
) -> Result<(Vec<Value>, u32, serde_json::Value), String> {
    let total: (i64,) = sqlx::query_as("SELECT COUNT(*) FROM dead_letter_queue")
        .fetch_one(pool)
        .await
        .map_err(|e| format!("dlq count failed: {e}"))?;
    let status_counts: Vec<(String, i64)> =
        sqlx::query_as("SELECT status::text, COUNT(*) FROM dead_letter_queue GROUP BY status")
            .fetch_all(pool)
            .await
            .map_err(|e| format!("dlq status counts failed: {e}"))?;
    let workflow_counts: Vec<(String, i64)> = sqlx::query_as(
        "SELECT workflow_name, COUNT(*) FROM dead_letter_queue GROUP BY workflow_name",
    )
    .fetch_all(pool)
    .await
    .map_err(|e| format!("dlq workflow counts failed: {e}"))?;
    let mut counts = serde_json::Map::new();
    for (status, count) in status_counts {
        counts.insert(status, serde_json::json!(count));
    }
    let mut by_workflow = serde_json::Map::new();
    for (name, count) in workflow_counts {
        by_workflow.insert(name, serde_json::json!(count));
    }
    let stats = serde_json::json!({
        "pending": counts.get("pending").cloned().unwrap_or(serde_json::json!(0)),
        "retrying": counts.get("retrying").cloned().unwrap_or(serde_json::json!(0)),
        "resolved": counts.get("resolved").cloned().unwrap_or(serde_json::json!(0)),
        "failed": counts.get("failed").cloned().unwrap_or(serde_json::json!(0)),
        "byWorkflow": by_workflow,
    });
    let rows: Vec<DlqRow> = sqlx::query_as(
        r#"
        SELECT id, workflow_name, payload, status::text, retry_count, error, created_at, last_retry_at
        FROM dead_letter_queue ORDER BY created_at DESC LIMIT $1 OFFSET $2
        "#,
    )
    .bind(i64::from(limit))
    .bind(i64::from(offset))
    .fetch_all(pool)
    .await
    .map_err(|e| format!("dlq list failed: {e}"))?;
    let entries = rows
        .into_iter()
        .map(
            |(
                id,
                workflow_name,
                payload,
                status,
                retry_count,
                error,
                created_at,
                last_retry_at,
            )| {
                serde_json::json!({
                    "id": id.to_string(),
                    "jobType": workflow_name,
                    "payloadJson": payload.map(|p| p.to_string()),
                    "status": status,
                    "attempts": retry_count,
                    "error": error,
                    "createdAt": created_at.to_rfc3339(),
                    "nextRetryAt": last_retry_at.map(|t| t.to_rfc3339()),
                })
            },
        )
        .collect();
    Ok((entries, total.0.max(0) as u32, stats))
}

pub async fn dlq_retry(pool: &PgPool, id: &str) -> Result<bool, String> {
    let id = Uuid::parse_str(id).map_err(|e| format!("invalid dlq id: {e}"))?;
    let result = sqlx::query(
        r#"
        UPDATE dead_letter_queue
        SET status = 'retrying', retry_count = retry_count + 1, last_retry_at = now()
        WHERE id = $1
        "#,
    )
    .bind(id)
    .execute(pool)
    .await
    .map_err(|e| format!("dlq retry failed: {e}"))?;
    Ok(result.rows_affected() > 0)
}

pub async fn dlq_resolve(pool: &PgPool, id: &str) -> Result<bool, String> {
    let id = Uuid::parse_str(id).map_err(|e| format!("invalid dlq id: {e}"))?;
    let result = sqlx::query(
        r#"
        UPDATE dead_letter_queue SET status = 'resolved', resolved_at = now() WHERE id = $1
        "#,
    )
    .bind(id)
    .execute(pool)
    .await
    .map_err(|e| format!("dlq resolve failed: {e}"))?;
    Ok(result.rows_affected() > 0)
}

pub async fn dlq_mark_failed(pool: &PgPool, id: &str) -> Result<bool, String> {
    let id = Uuid::parse_str(id).map_err(|e| format!("invalid dlq id: {e}"))?;
    let result = sqlx::query("UPDATE dead_letter_queue SET status = 'failed' WHERE id = $1")
        .bind(id)
        .execute(pool)
        .await
        .map_err(|e| format!("dlq mark-failed failed: {e}"))?;
    Ok(result.rows_affected() > 0)
}
