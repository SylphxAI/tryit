//! Reassign sessions when a guest upgrades or rotates their identity.

use sqlx::PgPool;

use super::super::{daily_free_picks, result_shares_db};
use super::parse_user_id;

const ADOPT_GUEST_REASSIGN_SQL: &str = r#"
UPDATE game_sessions AS guest
SET user_id = $2, adopted_from_guest = $1
WHERE guest.user_id = $1
  AND NOT EXISTS (
    SELECT 1 FROM game_sessions AS account
    WHERE account.user_id = $2
      AND ((guest.puzzle_id IS NOT NULL AND account.puzzle_id = guest.puzzle_id)
        OR (guest.is_ritual = true AND guest.day_key IS NOT NULL
            AND account.is_ritual = true AND account.game_slug = guest.game_slug
            AND account.day_key = guest.day_key))
  )
"#;

/// Move accepted guest rows onto the Platform account without duplicating a
/// finish for the same puzzle or ritual (user, module, product day).
///
/// Collisions are retained under the original guest. Noncolliding rows carry
/// their original guest provenance when adopted under verified possession.
pub async fn adopt_guest_sessions(
    pool: &PgPool,
    verified_account: &crate::capabilities::identity_access::adapters::platform_jwt::VerifiedIdentity,
    guest_user_id: &str,
    credential_hash: &str,
) -> Result<u64, String> {
    let mut tx = pool.begin().await.map_err(|e| e.to_string())?;
    sqlx::query("SELECT pg_advisory_xact_lock(hashtextextended('puzzled:guest-token:' || $1, 0))")
        .bind(credential_hash)
        .execute(&mut *tx)
        .await
        .map_err(|e| e.to_string())?;
    let value = adopt_guest_sessions_on_connection(
        &mut tx,
        verified_account,
        guest_user_id,
        credential_hash,
    )
    .await?;
    tx.commit().await.map_err(|e| e.to_string())?;
    Ok(value)
}

/// Move a player's sessions to another player id, recording the origin.
pub async fn reassign_sessions(
    connection: &mut sqlx::PgConnection,
    from: uuid::Uuid,
    to: uuid::Uuid,
) -> Result<u64, String> {
    sqlx::query(ADOPT_GUEST_REASSIGN_SQL)
        .bind(from)
        .bind(to)
        .execute(connection)
        .await
        .map(|r| r.rows_affected())
        .map_err(|e| e.to_string())
}

pub async fn adopt_guest_sessions_on_connection(
    connection: &mut sqlx::PgConnection,
    verified_account: &crate::capabilities::identity_access::adapters::platform_jwt::VerifiedIdentity,
    guest_user_id: &str,
    credential_hash: &str,
) -> Result<u64, String> {
    use crate::capabilities::identity_access::adapters::guest_credentials;
    use puzzled_core::identity_policy::guest_day_id::is_guest_user_id;
    let refused = || "identity_not_found".to_string();
    if is_guest_user_id(&verified_account.user_id) || !is_guest_user_id(guest_user_id) {
        return Err(refused());
    }
    let account = parse_user_id(&verified_account.user_id)?;
    let guest = parse_user_id(guest_user_id)?;
    if account == guest {
        return Err(refused());
    }
    guest_credentials::lock_players(&mut *connection, vec![account, guest])
        .await
        .map_err(|e| e.to_string())?;
    let destination_is_guest: bool =
        sqlx::query_scalar("SELECT EXISTS (SELECT 1 FROM guest_credentials WHERE user_id = $1)")
            .bind(account)
            .fetch_one(&mut *connection)
            .await
            .map_err(|e| e.to_string())?;
    if destination_is_guest {
        return Err(refused());
    }
    if !guest_credentials::account_backed(&mut *connection, account)
        .await
        .map_err(|e| e.to_string())?
    {
        return Err(refused());
    }
    let credential: Option<uuid::Uuid> = sqlx::query_scalar(
        "SELECT user_id FROM guest_credentials WHERE user_id = $1 AND token_hash = $2 AND revoked_at IS NULL AND adopted_user_id IS NULL FOR UPDATE",
    ).bind(guest).bind(credential_hash).fetch_optional(&mut *connection).await.map_err(|e| e.to_string())?;
    if credential != Some(guest)
        || guest_credentials::account_backed(&mut *connection, guest)
            .await
            .map_err(|e| e.to_string())?
    {
        return Err(refused());
    }
    let updated = sqlx::query(ADOPT_GUEST_REASSIGN_SQL)
        .bind(guest)
        .bind(account)
        .execute(&mut *connection)
        .await
        .map_err(|e| e.to_string())?;
    daily_free_picks::adopt(&mut *connection, account, guest)
        .await
        .map_err(|e| e.to_string())?;
    result_shares_db::adopt_guest_shares(&mut *connection, account, guest).await?;
    crate::capabilities::metrics::adopt(&mut *connection, account, guest).await?;
    crate::capabilities::gamification::adapters::freezes_db::adopt_guest_freezes(
        &mut *connection,
        account,
        guest,
    )
    .await?;
    sqlx::query("UPDATE guest_credentials SET adopted_user_id = $2, revoked_at = now(), revocation_reason = 'adopted' WHERE user_id = $1 AND adopted_user_id IS NULL")
        .bind(guest).bind(account).execute(&mut *connection).await.map_err(|e| e.to_string())?;
    Ok(updated.rows_affected())
}
