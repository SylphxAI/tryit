use sqlx::PgPool;
use uuid::Uuid;

use super::super::store::{account_backed, has_player_rows, lock_players};

/// Move an unclaimed legacy player's rows into a fresh server-owned namespace
/// bound to this token. Returns false when the legacy id has nothing to claim.
pub(super) async fn claim_legacy(pool: &PgPool, hash: &str, legacy: Uuid) -> Result<bool, String> {
    let e = |e: sqlx::Error| e.to_string();
    let fresh = Uuid::now_v7();
    let mut tx = pool.begin().await.map_err(e)?;
    sqlx::query("SELECT pg_advisory_xact_lock(hashtextextended('puzzled:guest-token:' || $1, 0))")
        .bind(hash)
        .execute(&mut *tx)
        .await
        .map_err(e)?;
    lock_players(&mut tx, vec![legacy, fresh])
        .await
        .map_err(e)?;
    let registered: bool = sqlx::query_scalar(
        "SELECT EXISTS (SELECT 1 FROM guest_credentials WHERE user_id = $1 OR token_hash = $2)",
    )
    .bind(legacy)
    .bind(hash)
    .fetch_one(&mut *tx)
    .await
    .map_err(e)?;
    if registered
        || account_backed(&mut tx, legacy).await.map_err(e)?
        || !has_player_rows(&mut tx, legacy).await.map_err(e)?
    {
        tx.rollback().await.map_err(e)?;
        return Ok(false);
    }
    sqlx::query("INSERT INTO guest_credentials (token_hash, user_id, provenance) VALUES ($1, $2, 'server_issued')")
        .bind(hash)
        .bind(fresh)
        .execute(&mut *tx)
        .await
        .map_err(e)?;
    crate::capabilities::puzzle_play::adapters::game_sessions_db::reassign_sessions(
        &mut tx, legacy, fresh,
    )
    .await?;
    crate::capabilities::puzzle_play::adapters::result_shares_db::adopt_guest_shares(
        &mut tx, fresh, legacy,
    )
    .await?;
    for (table, column, _) in
        crate::capabilities::preferences::adapters::account_deletion::USER_KEYED_COLUMNS
    {
        // Sessions and shares moved above; credentials are not player data.
        if matches!(
            *table,
            "guest_credentials" | "game_sessions" | "result_shares"
        ) {
            continue;
        }
        let statement = format!("UPDATE \"{table}\" SET \"{column}\" = $2 WHERE \"{column}\" = $1");
        sqlx::query(sqlx::AssertSqlSafe(statement))
            .bind(legacy)
            .bind(fresh)
            .execute(&mut *tx)
            .await
            .map_err(|err| format!("legacy claim failed on {table}.{column}: {err}"))?;
    }
    // Nothing may stay under the legacy id.
    if has_player_rows(&mut tx, legacy).await.map_err(e)? {
        return Err("legacy claim left rows behind".into());
    }
    tx.commit().await.map_err(e)?;
    Ok(true)
}
