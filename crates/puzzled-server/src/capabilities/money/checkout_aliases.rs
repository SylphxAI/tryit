//! Lookup hints for providers that return a processor ID but read by Money ID.
//! Neither ownership nor settlement is ever inferred from this index.

use sqlx::PgPool;

pub(super) fn valid_id(id: &str) -> bool {
    !id.is_empty()
        && id.len() <= 128
        && id
            .bytes()
            .all(|b| b.is_ascii_alphanumeric() || matches!(b, b'_' | b'-'))
}

pub(super) async fn remember(pool: Option<&PgPool>, processor: &str, canonical: &str) {
    let Some(pool) = pool else { return };
    if !processor.starts_with("cs_") || !valid_id(processor) || !valid_id(canonical) {
        return;
    }
    if sqlx::query("INSERT INTO checkout_session_aliases (id, processor_session_id, money_session_id) VALUES ($1, $2, $3) ON CONFLICT (processor_session_id) DO NOTHING")
        .bind(uuid::Uuid::now_v7())
        .bind(processor)
        .bind(canonical)
        .execute(pool)
        .await
        .is_err()
    {
        // Analytics must not prevent the customer paying; Money itself may
        // resolve the alias at readback when this write was unavailable.
        tracing::warn!("checkout session alias could not be retained");
    }
}

pub(crate) async fn canonical(pool: &PgPool, returned: &str) -> Option<String> {
    if !returned.starts_with("cs_") || !valid_id(returned) {
        return None;
    }
    sqlx::query_scalar(
        "SELECT money_session_id FROM checkout_session_aliases WHERE processor_session_id = $1",
    )
    .bind(returned)
    .fetch_optional(pool)
    .await
    .ok()
    .flatten()
}
