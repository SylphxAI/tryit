use base64::{engine::general_purpose::URL_SAFE_NO_PAD, Engine};
use sha2::{Digest, Sha256};
use sqlx::{PgConnection, PgPool};
use uuid::Uuid;

use std::fmt::Write as _;
use std::sync::LazyLock;

use crate::capabilities::preferences::adapters::account_deletion::USER_KEYED_COLUMNS;

use super::{ACCOUNT_BACKED, COOKIE};

static ACCOUNT_BACKED_SQL: LazyLock<String> = LazyLock::new(|| format!("SELECT {ACCOUNT_BACKED}"));
static UNUSED_PLAYER_SQL: LazyLock<String> = LazyLock::new(|| {
    let mut sql = format!("SELECT NOT ({ACCOUNT_BACKED}");
    for (table, column, _) in USER_KEYED_COLUMNS {
        // Identifiers are compile-time inventory entries, never request input.
        let _ = write!(
            sql,
            r#" OR EXISTS (SELECT 1 FROM "{table}" WHERE "{column}" = $1)"#
        );
    }
    sql.push(')');
    sql
});

pub async fn account_backed(
    connection: &mut PgConnection,
    player: Uuid,
) -> Result<bool, sqlx::Error> {
    sqlx::query_scalar(sqlx::AssertSqlSafe(ACCOUNT_BACKED_SQL.as_str()))
        .bind(player)
        .fetch_one(connection)
        .await
}

/// Account mapping, guest access, erasure, and adoption share this lock order.
pub async fn lock_players(
    connection: &mut PgConnection,
    players: Vec<Uuid>,
) -> Result<(), sqlx::Error> {
    // Most requests lock exactly one player. Keep the same hash and lock as
    // the sorted multi-player case, without a separate lookup round trip.
    if players.len() == 1 {
        sqlx::query("SELECT pg_advisory_xact_lock(hashtextextended('puzzled:erasure:' || $1::uuid::text, 0))")
            .bind(players[0])
            .execute(connection)
            .await?;
        return Ok(());
    }
    if players.is_empty() {
        return Ok(());
    }
    let keys: Vec<i64> = sqlx::query_scalar(
        "SELECT DISTINCT hashtextextended('puzzled:erasure:' || player::text, 0) AS key          FROM unnest($1::uuid[]) AS players(player) ORDER BY key",
    )
    .bind(&players)
    .fetch_all(&mut *connection)
    .await?;
    for key in keys {
        sqlx::query("SELECT pg_advisory_xact_lock($1)")
            .bind(key)
            .execute(&mut *connection)
            .await?;
    }
    Ok(())
}

pub fn token_hash(token: &str) -> Option<String> {
    let raw = URL_SAFE_NO_PAD.decode(token).ok()?;
    (raw.len() == 32).then(|| URL_SAFE_NO_PAD.encode(Sha256::digest(raw)))
}

pub async fn lookup_hash(pool: &PgPool, hash: &str) -> Result<Option<Uuid>, sqlx::Error> {
    sqlx::query_scalar("SELECT user_id FROM guest_credentials WHERE token_hash = $1 AND adopted_user_id IS NULL AND revoked_at IS NULL")
        .bind(hash).fetch_optional(pool).await
}

static VALIDATE_LOCKED_SQL: LazyLock<String> = LazyLock::new(|| {
    format!("SELECT NOT ({ACCOUNT_BACKED}) FROM guest_credentials WHERE user_id = $1 AND token_hash = $2 AND adopted_user_id IS NULL AND revoked_at IS NULL FOR SHARE")
});

pub async fn validate_locked(
    connection: &mut PgConnection,
    player: Uuid,
    hash: &str,
) -> Result<bool, sqlx::Error> {
    Ok(
        sqlx::query_scalar(sqlx::AssertSqlSafe(VALIDATE_LOCKED_SQL.as_str()))
            .bind(player)
            .bind(hash)
            .fetch_optional(connection)
            .await?
            .unwrap_or(false),
    )
}

pub fn mint_cookie(existing: Option<&str>) -> Result<String, sqlx::Error> {
    let token = match existing.filter(|token| token_hash(token).is_some()) {
        Some(token) => token.to_string(),
        None => {
            let mut raw = [0_u8; 32];
            getrandom::fill(&mut raw)
                .map_err(|error| sqlx::Error::Io(std::io::Error::other(error.to_string())))?;
            URL_SAFE_NO_PAD.encode(raw)
        }
    };
    Ok(format!(
        "{COOKIE}={token}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=34560000"
    ))
}

pub async fn unused_player(
    connection: &mut PgConnection,
    player: Uuid,
) -> Result<bool, sqlx::Error> {
    sqlx::query_scalar(sqlx::AssertSqlSafe(UNUSED_PLAYER_SQL.as_str()))
        .bind(player)
        .fetch_one(connection)
        .await
}

/// Test fixture that performs a first guest write's allocation. Production
/// bootstrap only returns a cookie and never populates the registry.
#[cfg(test)]
pub async fn issue(pool: &PgPool) -> Result<String, sqlx::Error> {
    issue_with_first_candidate(pool, Uuid::now_v7()).await
}

#[cfg(test)]
pub(crate) async fn issue_with_first_candidate(
    pool: &PgPool,
    mut player: Uuid,
) -> Result<String, sqlx::Error> {
    let cookie = mint_cookie(None)?;
    let token = cookie
        .split(';')
        .next()
        .and_then(|pair| pair.split_once('=').map(|(_, token)| token))
        .ok_or(sqlx::Error::RowNotFound)?;
    let hash = token_hash(token).ok_or(sqlx::Error::RowNotFound)?;
    loop {
        let mut tx = pool.begin().await?;
        lock_players(&mut tx, vec![player]).await?;
        if !unused_player(&mut tx, player).await? {
            tx.rollback().await?;
            player = Uuid::now_v7();
            continue;
        }
        sqlx::query("INSERT INTO guest_credentials (token_hash, user_id, provenance) VALUES ($1, $2, 'server_issued')")
            .bind(&hash).bind(player).execute(&mut *tx).await?;
        tx.commit().await?;
        return Ok(cookie);
    }
}

/// True when any user-keyed table still holds rows owned by the player
/// (credential and adoption-provenance columns are not ownership).
pub(super) async fn has_player_rows(
    connection: &mut PgConnection,
    player: Uuid,
) -> Result<bool, sqlx::Error> {
    for (table, column, _) in
        crate::capabilities::preferences::adapters::account_deletion::USER_KEYED_COLUMNS
    {
        if *table == "guest_credentials" || *column == "adopted_from_guest" {
            continue;
        }
        let statement =
            format!("SELECT EXISTS (SELECT 1 FROM \"{table}\" WHERE \"{column}\" = $1)");
        if sqlx::query_scalar(sqlx::AssertSqlSafe(statement))
            .bind(player)
            .fetch_one(&mut *connection)
            .await?
        {
            return Ok(true);
        }
    }
    Ok(false)
}

#[cfg(test)]
#[allow(clippy::unwrap_used)]
#[path = "allocation_tests.rs"]
mod allocation_tests;
