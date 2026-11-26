use crate::capabilities::preferences::adapters::account_deletion::USER_KEYED_COLUMNS;
use crate::test_support::fresh_database;
use sqlx::AssertSqlSafe;
use uuid::Uuid;

use super::unused_player;

#[tokio::test]
async fn each_inventory_column_independently_blocks_allocation() {
    let Some(pool) = fresh_database().await else {
        return;
    };
    for &(table, column, _) in USER_KEYED_COLUMNS {
        let mut tx = pool.begin().await.unwrap();
        let candidate = Uuid::now_v7();
        assert!(unused_player(&mut tx, candidate).await.unwrap());
        // Supply required fields on the real schema, keeping every other ID
        // distinct. Each transaction rolls back its fixture after the assertion.
        let other = Uuid::now_v7();
        let (fields, values) = match (table, column) {
            ("daily_free_picks" | "streak_freeze_awards" | "streak_freeze_uses", _) => {
                match table {
                    "daily_free_picks" => (",day_key,game_slug", ",CURRENT_DATE,'word-guess'"),
                    "streak_freeze_awards" => (",day_key,granted", ",CURRENT_DATE,true"),
                    _ => (",day_key", ",CURRENT_DATE"),
                }
            }
            ("checkout_attempts", _) => (
                ",request_id,money_session_id,request",
                ",gen_random_uuid(),'fixture','{}'",
            ),
            ("synthetic_fixtures", _) => (
                ",fixture_key,auth_subject,synthetic_time",
                ",'fixture','fixture',now()",
            ),
            ("share_landings", _) => {
                sqlx::query("INSERT INTO result_shares (id,user_id,game_slug,day_key,status,attempts) VALUES ($1,gen_random_uuid(),'word-guess','2026-11-26','won',1)").bind(other).execute(&mut *tx).await.unwrap();
                (",share_id,day_key", ",$2,'2026-11-26'")
            }
            ("metric_audiences", _) => (",day_key,paid", ",'2026-11-26',false"),
            ("guest_credentials", "user_id") => {
                (",token_hash,provenance", ",'fixture','server_issued'")
            }
            ("guest_credentials", _) => (
                ",user_id,token_hash,provenance,revoked_at,revocation_reason",
                ",$2,'fixture','server_issued',now(),'adopted'",
            ),
            ("game_sessions", "user_id") => (",game_slug", ",'word-guess'"),
            ("game_sessions", _) => (",user_id,game_slug", ",$2,'word-guess'"),
            ("result_shares", "user_id") => (
                ",id,game_slug,day_key,status,attempts",
                ",gen_random_uuid(),'word-guess','2026-11-26','won',1",
            ),
            ("result_shares", _) => (
                ",id,user_id,game_slug,day_key,status,attempts",
                ",gen_random_uuid(),$2,'word-guess','2026-11-26','won',1",
            ),
            ("tryit_conversions", _) => (",event,ref,occurred_at", ",'signup','fixture',now()"),
            ("auth_subjects", _) => (",subject", ",'fixture'"),
            ("checkout_consents", _) => (
                ",id,plan_id,price_key,locale,statement",
                ",gen_random_uuid(),'fixture','fixture','en','fixture'",
            ),
            ("plus_trials", _) => (",ends_at", ",now()"),
            ("family_members", "owner_user_id") => (",member_user_id", ",$2"),
            ("family_members", _) => (",owner_user_id", ",$2"),
            ("family_groups", _) => (",invite_code", ",'fixture'"),
            ("announcement_dismissals", _) => {
                sqlx::query(
                    "INSERT INTO announcements (id,title,content) VALUES ($1,'fixture','fixture')",
                )
                .bind(other)
                .execute(&mut *tx)
                .await
                .unwrap();
                (",announcement_id", ",$2")
            }
            ("audit_logs", _) => (",action,resource_type", ",'create','fixture'"),
            ("push_subscriptions", _) => {
                (",endpoint,p256dh,auth", ",'fixture','fixture','fixture'")
            }
            ("win_back_emails", _) => (",email_type", ",'day7'"),
            _ => ("", ""),
        };
        let sql = format!(r#"INSERT INTO "{table}" ("{column}"{fields}) VALUES ($1{values})"#);
        let mut query = sqlx::query(AssertSqlSafe(sql)).bind(candidate);
        if values.contains("$2") {
            query = query.bind(other);
        }
        query
            .execute(&mut *tx)
            .await
            .unwrap_or_else(|e| panic!("{table}.{column} fixture: {e}"));
        assert!(
            !unused_player(&mut tx, candidate).await.unwrap(),
            "missed {table}.{column}"
        );
        assert!(
            unused_player(&mut tx, Uuid::now_v7()).await.unwrap(),
            "unrelated player denied by {table}.{column}"
        );
        tx.rollback().await.unwrap();
    }
}
