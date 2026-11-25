//! Announcement storage and UTC schedule bounds.

use chrono::NaiveDateTime;
use serde_json::Value;
use sqlx::PgPool;
use uuid::Uuid;

// The announcements timestamps are plain `timestamp` columns holding UTC.
type AnnouncementRow = (
    Uuid,
    String,
    String,
    String,
    bool,
    bool,
    Option<NaiveDateTime>,
    Option<NaiveDateTime>,
    NaiveDateTime,
    NaiveDateTime,
);

const ANNOUNCEMENT_COLUMNS: &str = "id, title, content, type::text, is_active, dismissible, \
     starts_at, ends_at, created_at, updated_at";

fn announcement_json(row: AnnouncementRow) -> Value {
    let (
        id,
        title,
        content,
        typ,
        is_active,
        dismissible,
        starts_at,
        ends_at,
        created_at,
        updated_at,
    ) = row;
    let bound = |t: Option<NaiveDateTime>| t.map(|t| t.and_utc().to_rfc3339()).unwrap_or_default();
    serde_json::json!({
        "id": id.to_string(),
        "title": title,
        "body": content,
        "type": typ,
        "active": is_active,
        "dismissible": dismissible,
        "startsAt": bound(starts_at),
        "endsAt": bound(ends_at),
        "createdAt": created_at.and_utc().to_rfc3339(),
        "updatedAt": updated_at.and_utc().to_rfc3339(),
    })
}

/// An RFC 3339 bound as the UTC wall clock the column stores; empty = no bound.
pub fn parse_announcement_bound(value: &str) -> Result<Option<NaiveDateTime>, String> {
    let value = value.trim();
    if value.is_empty() {
        return Ok(None);
    }
    chrono::DateTime::parse_from_rfc3339(value)
        .map(|t| Some(t.naive_utc()))
        .map_err(|e| format!("invalid announcement time: {e}"))
}

/// A window must end after it starts (either bound may be open).
pub fn validate_announcement_window(
    starts_at: Option<NaiveDateTime>,
    ends_at: Option<NaiveDateTime>,
) -> Result<(), &'static str> {
    match (starts_at, ends_at) {
        (Some(start), Some(end)) if end <= start => Err("ends_before_start"),
        _ => Ok(()),
    }
}

pub async fn list_announcements(pool: &PgPool) -> Result<Vec<Value>, String> {
    let rows: Vec<AnnouncementRow> = sqlx::query_as(sqlx::AssertSqlSafe(format!(
        "SELECT {ANNOUNCEMENT_COLUMNS} FROM announcements ORDER BY created_at DESC"
    )))
    .fetch_all(pool)
    .await
    .map_err(|e| format!("announcements list failed: {e}"))?;
    Ok(rows.into_iter().map(announcement_json).collect())
}

#[allow(clippy::too_many_arguments)]
pub async fn create_announcement(
    pool: &PgPool,
    title: &str,
    body: &str,
    typ: &str,
    active: bool,
    dismissible: bool,
    starts_at: Option<NaiveDateTime>,
    ends_at: Option<NaiveDateTime>,
    actor_id: &str,
) -> Result<Value, String> {
    let actor = Uuid::parse_str(actor_id).map_err(|e| format!("invalid actor id: {e}"))?;
    let row: AnnouncementRow = sqlx::query_as(sqlx::AssertSqlSafe(format!(
        "INSERT INTO announcements \
         (title, content, type, is_active, dismissible, starts_at, ends_at, created_by) \
         VALUES ($1, $2, $3::announcement_type, $4, $5, $6, $7, $8) \
         RETURNING {ANNOUNCEMENT_COLUMNS}"
    )))
    .bind(title)
    .bind(body)
    .bind(typ)
    .bind(active)
    .bind(dismissible)
    .bind(starts_at)
    .bind(ends_at)
    .bind(actor)
    .fetch_one(pool)
    .await
    .map_err(|e| format!("announcement insert failed: {e}"))?;
    Ok(announcement_json(row))
}

/// Update bounds: outer `None` = unchanged, `Some(None)` = clear.
#[allow(clippy::too_many_arguments)]
pub async fn update_announcement(
    pool: &PgPool,
    id: &str,
    title: Option<&str>,
    body: Option<&str>,
    typ: Option<&str>,
    active: Option<bool>,
    dismissible: Option<bool>,
    starts_at: Option<Option<NaiveDateTime>>,
    ends_at: Option<Option<NaiveDateTime>>,
) -> Result<Value, String> {
    let id = Uuid::parse_str(id).map_err(|e| format!("invalid announcement id: {e}"))?;
    if starts_at.is_some() || ends_at.is_some() {
        // The window that results is checked, not just the bound that was sent.
        let stored: Option<(Option<NaiveDateTime>, Option<NaiveDateTime>)> =
            sqlx::query_as("SELECT starts_at, ends_at FROM announcements WHERE id = $1")
                .bind(id)
                .fetch_optional(pool)
                .await
                .map_err(|e| format!("announcement update failed: {e}"))?;
        let (old_start, old_end) = stored.ok_or_else(|| "announcement not found".to_string())?;
        validate_announcement_window(starts_at.unwrap_or(old_start), ends_at.unwrap_or(old_end))
            .map_err(str::to_string)?;
    }
    let row: Option<AnnouncementRow> = sqlx::query_as(sqlx::AssertSqlSafe(format!(
        "UPDATE announcements SET \
            title = COALESCE($2, title), \
            content = COALESCE($3, content), \
            type = COALESCE($4::announcement_type, type), \
            is_active = COALESCE($5, is_active), \
            dismissible = COALESCE($6, dismissible), \
            starts_at = CASE WHEN $7 THEN $8 ELSE starts_at END, \
            ends_at = CASE WHEN $9 THEN $10 ELSE ends_at END, \
            updated_at = now() \
         WHERE id = $1 \
         RETURNING {ANNOUNCEMENT_COLUMNS}"
    )))
    .bind(id)
    .bind(title)
    .bind(body)
    .bind(typ)
    .bind(active)
    .bind(dismissible)
    .bind(starts_at.is_some())
    .bind(starts_at.flatten())
    .bind(ends_at.is_some())
    .bind(ends_at.flatten())
    .fetch_optional(pool)
    .await
    .map_err(|e| format!("announcement update failed: {e}"))?;
    row.map(announcement_json)
        .ok_or_else(|| "announcement not found".to_string())
}

pub async fn delete_announcement(pool: &PgPool, id: &str) -> Result<bool, String> {
    let id = Uuid::parse_str(id).map_err(|e| format!("invalid announcement id: {e}"))?;
    let result = sqlx::query("DELETE FROM announcements WHERE id = $1")
        .bind(id)
        .execute(pool)
        .await
        .map_err(|e| format!("announcement delete failed: {e}"))?;
    Ok(result.rows_affected() > 0)
}
