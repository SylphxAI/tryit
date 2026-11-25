//! Audit-log reads and pagination.

use serde_json::Value;
use sqlx::PgPool;
use uuid::Uuid;

type AuditRow = (
    Uuid,
    Option<Uuid>,
    Option<Uuid>,
    String,
    String,
    Option<String>,
    Option<Value>,
    Option<String>,
    Option<String>,
    chrono::DateTime<chrono::Utc>,
);
type AuditGetRow = (
    Option<Uuid>,
    Option<Uuid>,
    String,
    String,
    Option<String>,
    Option<Value>,
    Option<String>,
    Option<String>,
    chrono::DateTime<chrono::Utc>,
);

pub async fn list_audit_logs(
    pool: &PgPool,
    limit: u32,
    offset: u32,
    action: Option<&str>,
) -> Result<(Vec<Value>, u32), String> {
    let total: (i64,) = match action {
        Some(action) => sqlx::query_as("SELECT COUNT(*) FROM audit_logs WHERE action::text = $1")
            .bind(action)
            .fetch_one(pool)
            .await
            .map_err(|e| format!("audit count failed: {e}"))?,
        None => sqlx::query_as("SELECT COUNT(*) FROM audit_logs")
            .fetch_one(pool)
            .await
            .map_err(|e| format!("audit count failed: {e}"))?,
    };
    let rows: Vec<AuditRow> = match action {
        Some(action) => sqlx::query_as(
            r#"
            SELECT id, user_id, actor_id, action::text, resource_type, resource_id, metadata, ip_address, user_agent, created_at
            FROM audit_logs WHERE action::text = $1
            ORDER BY created_at DESC LIMIT $2 OFFSET $3
            "#,
        )
        .bind(action)
        .bind(i64::from(limit))
        .bind(i64::from(offset))
        .fetch_all(pool)
        .await
        .map_err(|e| format!("audit list failed: {e}"))?,
        None => sqlx::query_as(
            r#"
            SELECT id, user_id, actor_id, action::text, resource_type, resource_id, metadata, ip_address, user_agent, created_at
            FROM audit_logs ORDER BY created_at DESC LIMIT $1 OFFSET $2
            "#,
        )
        .bind(i64::from(limit))
        .bind(i64::from(offset))
        .fetch_all(pool)
        .await
        .map_err(|e| format!("audit list failed: {e}"))?,
    };
    let entries = rows
        .into_iter()
        .map(
            |(
                id,
                user_id,
                actor_id,
                action,
                resource_type,
                resource_id,
                metadata,
                ip_address,
                user_agent,
                created_at,
            )| {
                serde_json::json!({
                    "id": id.to_string(),
                    "userId": user_id.map(|u| u.to_string()),
                    "actorId": actor_id.map(|u| u.to_string()),
                    "action": action,
                    "entityType": resource_type,
                    "entityId": resource_id,
                    "metadataJson": metadata.map(|m| m.to_string()),
                    "ipAddress": ip_address,
                    "userAgent": user_agent,
                    "createdAt": created_at.to_rfc3339(),
                })
            },
        )
        .collect();
    Ok((entries, total.0.max(0) as u32))
}

pub async fn get_audit_log(pool: &PgPool, id: &str) -> Result<Value, String> {
    let id = Uuid::parse_str(id).map_err(|e| format!("invalid audit id: {e}"))?;
    let row: Option<AuditGetRow> = sqlx::query_as(
        r#"
        SELECT user_id, actor_id, action::text, resource_type, resource_id, metadata, ip_address, user_agent, created_at
        FROM audit_logs WHERE id = $1
        "#,
    )
    .bind(id)
    .fetch_optional(pool)
    .await
    .map_err(|e| format!("audit get failed: {e}"))?;
    row.map(
        |(
            user_id,
            actor_id,
            action,
            resource_type,
            resource_id,
            metadata,
            ip_address,
            user_agent,
            created_at,
        )| {
            serde_json::json!({
                "id": id.to_string(),
                "userId": user_id.map(|u| u.to_string()),
                "actorId": actor_id.map(|u| u.to_string()),
                "action": action,
                "entityType": resource_type,
                "entityId": resource_id,
                "metadataJson": metadata.map(|m| m.to_string()),
                "ipAddress": ip_address,
                "userAgent": user_agent,
                "createdAt": created_at.to_rfc3339(),
            })
        },
    )
    .ok_or_else(|| "audit entry not found".to_string())
}
