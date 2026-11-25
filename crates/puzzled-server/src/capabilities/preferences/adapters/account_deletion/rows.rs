//! Player-keyed row inventory and the read-only erasure estimate.

use sqlx::PgPool;
use uuid::Uuid;

/// Every (table, column) that stores a player id, with the statement that
/// erases it. Rows matching the player are deleted, including audit rows where
/// they are the subject or the actor.
///
/// Money facts are Sylphx Money's, not this database's. The erasure call
/// refuses while a Money subscription still renews, so nothing is charged to an
/// erased account.
pub const USER_KEYED_COLUMNS: &[(&str, &str, &str)] = &[
    (
        "daily_free_picks",
        "user_id",
        r#"DELETE FROM "daily_free_picks" WHERE "user_id" = $1"#,
    ),
    (
        "checkout_attempts",
        "user_id",
        r#"DELETE FROM "checkout_attempts" WHERE "user_id" = $1"#,
    ),
    (
        "synthetic_fixtures",
        "user_id",
        r#"DELETE FROM "synthetic_fixtures" WHERE "user_id" = $1"#,
    ),
    (
        "share_landings",
        "user_id",
        r#"DELETE FROM "share_landings" WHERE "user_id" = $1"#,
    ),
    (
        "metric_audiences",
        "user_id",
        r#"DELETE FROM "metric_audiences" WHERE "user_id" = $1"#,
    ),
    (
        "guest_credentials",
        "user_id",
        r#"DELETE FROM "guest_credentials" WHERE "user_id" = $1"#,
    ),
    (
        "guest_credentials",
        "adopted_user_id",
        r#"DELETE FROM "guest_credentials" WHERE "adopted_user_id" = $1"#,
    ),
    (
        "game_sessions",
        "adopted_from_guest",
        r#"DELETE FROM "game_sessions" WHERE "adopted_from_guest" = $1"#,
    ),
    (
        "result_shares",
        "adopted_from_guest",
        r#"DELETE FROM "result_shares" WHERE "adopted_from_guest" = $1"#,
    ),
    (
        "tryit_conversions",
        "user_id",
        r#"DELETE FROM "tryit_conversions" WHERE "user_id" = $1"#,
    ),
    (
        "account_attribution",
        "user_id",
        r#"DELETE FROM "account_attribution" WHERE "user_id" = $1"#,
    ),
    (
        "funnel_signup_receipts",
        "user_id",
        r#"DELETE FROM "funnel_signup_receipts" WHERE "user_id" = $1"#,
    ),
    (
        "auth_subjects",
        "user_id",
        r#"DELETE FROM "auth_subjects" WHERE "user_id" = $1"#,
    ),
    (
        "checkout_consents",
        "user_id",
        r#"DELETE FROM "checkout_consents" WHERE "user_id" = $1"#,
    ),
    (
        "plus_trials",
        "user_id",
        r#"DELETE FROM "plus_trials" WHERE "user_id" = $1"#,
    ),
    (
        "family_members",
        "owner_user_id",
        r#"DELETE FROM "family_members" WHERE "owner_user_id" = $1"#,
    ),
    (
        "family_members",
        "member_user_id",
        r#"DELETE FROM "family_members" WHERE "member_user_id" = $1"#,
    ),
    (
        "family_groups",
        "owner_user_id",
        r#"DELETE FROM "family_groups" WHERE "owner_user_id" = $1"#,
    ),
    (
        "announcement_dismissals",
        "user_id",
        r#"DELETE FROM "announcement_dismissals" WHERE "user_id" = $1"#,
    ),
    (
        "audit_logs",
        "user_id",
        r#"DELETE FROM "audit_logs" WHERE "user_id" = $1"#,
    ),
    (
        "audit_logs",
        "actor_id",
        r#"DELETE FROM "audit_logs" WHERE "actor_id" = $1"#,
    ),
    (
        "game_sessions",
        "user_id",
        r#"DELETE FROM "game_sessions" WHERE "user_id" = $1"#,
    ),
    (
        "notification_preferences",
        "user_id",
        r#"DELETE FROM "notification_preferences" WHERE "user_id" = $1"#,
    ),
    (
        "push_subscriptions",
        "user_id",
        r#"DELETE FROM "push_subscriptions" WHERE "user_id" = $1"#,
    ),
    (
        "result_shares",
        "user_id",
        r#"DELETE FROM "result_shares" WHERE "user_id" = $1"#,
    ),
    (
        "user_display_cache",
        "user_id",
        r#"DELETE FROM "user_display_cache" WHERE "user_id" = $1"#,
    ),
    (
        "user_freeze_data",
        "user_id",
        r#"DELETE FROM "user_freeze_data" WHERE "user_id" = $1"#,
    ),
    (
        "streak_freeze_awards",
        "user_id",
        r#"DELETE FROM "streak_freeze_awards" WHERE "user_id" = $1"#,
    ),
    (
        "streak_freeze_uses",
        "user_id",
        r#"DELETE FROM "streak_freeze_uses" WHERE "user_id" = $1"#,
    ),
    (
        "user_preferences",
        "user_id",
        r#"DELETE FROM "user_preferences" WHERE "user_id" = $1"#,
    ),
    (
        "win_back_emails",
        "user_id",
        r#"DELETE FROM "win_back_emails" WHERE "user_id" = $1"#,
    ),
];

/// What an erasure of this player would delete, by count, without deleting
/// anything (the operator's dry run). An upper bound: a row that names the
/// player in two columns counts twice.
pub async fn count_account_data(pool: &PgPool, player: Uuid) -> Result<u64, sqlx::Error> {
    let mut connection = pool.acquire().await?;
    let mut players = vec![player];
    players.extend(
        sqlx::query_scalar::<_, Uuid>(
            "SELECT user_id FROM guest_credentials WHERE adopted_user_id = $1",
        )
        .bind(player)
        .fetch_all(&mut *connection)
        .await?,
    );
    let mut total = 0u64;
    for player in &players {
        for (_, _, statement) in USER_KEYED_COLUMNS {
            let count = statement.replacen("DELETE FROM", "SELECT count(*) FROM", 1);
            let rows: i64 = sqlx::query_scalar(sqlx::AssertSqlSafe(count))
                .bind(player)
                .fetch_one(&mut *connection)
                .await?;
            total += u64::try_from(rows).unwrap_or_default();
        }
    }
    Ok(total)
}
