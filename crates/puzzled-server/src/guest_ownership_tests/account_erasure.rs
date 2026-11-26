use super::support::request;
use crate::test_support::{fresh_database, token};
use crate::{router, AppState};
use axum::http::StatusCode;
use uuid::Uuid;

pub(super) async fn account_erasure_includes_retained_adopted_guest_collisions_and_provenance() {
    use crate::capabilities::identity_access::adapters::guest_credentials;
    use crate::capabilities::preferences::adapters::account_deletion::{
        delete_account_data, USER_KEYED_COLUMNS,
    };
    let Some(pool) = fresh_database().await else {
        return;
    };
    let cookie = guest_credentials::issue(&pool).await.unwrap();
    let pair = cookie.split(';').next().unwrap();
    let hash = guest_credentials::token_hash(pair.split_once('=').unwrap().1).unwrap();
    let guest = guest_credentials::lookup_hash(&pool, &hash)
        .await
        .unwrap()
        .unwrap();
    let account = Uuid::now_v7();
    sqlx::query("INSERT INTO auth_subjects(subject,user_id) VALUES($1,$2)")
        .bind(format!("principal-{account}"))
        .bind(account)
        .execute(&pool)
        .await
        .unwrap();
    for owner in [guest, account] {
        sqlx::query("INSERT INTO game_sessions(user_id,game_slug,status,attempts,mode,is_ritual,day_key) VALUES($1,'word-guess','won',1,'daily',true,'2026-09-30')")
            .bind(owner).execute(&pool).await.unwrap();
        sqlx::query("INSERT INTO result_shares(id,user_id,game_slug,day_key,status,attempts) VALUES($1,$2,'word-guess','2026-09-30','won',1)")
            .bind(Uuid::now_v7()).bind(owner).execute(&pool).await.unwrap();
        sqlx::query("INSERT INTO user_freeze_data(user_id,freezes_available) VALUES($1,1)")
            .bind(owner)
            .execute(&pool)
            .await
            .unwrap();
        sqlx::query("INSERT INTO streak_freeze_awards(user_id,day_key,granted) VALUES($1,'2026-09-29',true)")
            .bind(owner).execute(&pool).await.unwrap();
    }
    sqlx::query("INSERT INTO game_sessions(user_id,game_slug,status,attempts,mode,is_ritual,day_key) VALUES($1,'word-guess','won',1,'daily',true,'2026-09-29')")
        .bind(guest).execute(&pool).await.unwrap();
    let app = router(AppState::new(Some(pool.clone())));
    assert_eq!(
        request(
            &app,
            "/puzzled.v1.StatsService/GetHistory",
            Some(pair),
            Some(&token(&account.to_string())),
            None
        )
        .await
        .0,
        StatusCode::OK
    );
    let retained: i64 = sqlx::query_scalar("SELECT count(*) FROM game_sessions WHERE user_id=$1")
        .bind(guest)
        .fetch_one(&pool)
        .await
        .unwrap();
    assert_eq!(retained, 1);
    delete_account_data(&pool, &account.to_string())
        .await
        .unwrap();
    for (table, column, _) in USER_KEYED_COLUMNS {
        let statement = format!("SELECT count(*) FROM \"{table}\" WHERE \"{column}\" IN ($1,$2)");
        let remaining: i64 = sqlx::query_scalar(sqlx::AssertSqlSafe(statement))
            .bind(account)
            .bind(guest)
            .fetch_one(&pool)
            .await
            .unwrap();
        assert_eq!(remaining, 0, "{table}.{column}");
    }
    pool.close().await;
}

pub(super) async fn raced_adoption_and_erasure_preserve_only_unclaimed_guest_or_erase_linked_sources(
) {
    use crate::capabilities::identity_access::adapters::guest_credentials;
    use crate::capabilities::preferences::adapters::account_deletion::delete_account_data;
    use crate::capabilities::puzzle_play::adapters::game_sessions_db::{
        adopt_guest_sessions, adopt_guest_sessions_on_connection,
    };
    let Some(pool) = fresh_database().await else {
        return;
    };
    for adoption_first in [true, false] {
        let cookie = guest_credentials::issue(&pool).await.unwrap();
        let raw = cookie.split(';').next().unwrap().split_once('=').unwrap().1;
        let hash = guest_credentials::token_hash(raw).unwrap();
        let guest = guest_credentials::lookup_hash(&pool, &hash)
            .await
            .unwrap()
            .unwrap();
        let account = Uuid::now_v7();
        sqlx::query("INSERT INTO auth_subjects(subject,user_id) VALUES($1,$2)")
            .bind(format!("principal-{account}"))
            .bind(account)
            .execute(&pool)
            .await
            .unwrap();
        for owner in [account, guest] {
            sqlx::query("INSERT INTO game_sessions(user_id,game_slug,status,attempts,mode,is_ritual,day_key) VALUES($1,'word-guess','won',1,'daily',true,'2026-09-30')")
                .bind(owner).execute(&pool).await.unwrap();
        }
        let identity = crate::VerifiedIdentity {
            user_id: account.to_string(),
            display_name: None,
            email: None,
            actor: None,
        };
        let mut tx = pool.begin().await.unwrap();
        if adoption_first {
            sqlx::query(
                "SELECT pg_advisory_xact_lock(hashtextextended('puzzled:guest-token:' || $1, 0))",
            )
            .bind(&hash)
            .execute(&mut *tx)
            .await
            .unwrap();
            adopt_guest_sessions_on_connection(
                &mut tx,
                &identity,
                &format!("guest_{guest}"),
                &hash,
            )
            .await
            .unwrap();
            let erasure_pool = pool.clone();
            let erase = tokio::spawn(async move {
                delete_account_data(&erasure_pool, &account.to_string()).await
            });
            tokio::time::timeout(std::time::Duration::from_secs(2),async {
                loop {
                    let blocked: bool = sqlx::query_scalar("SELECT EXISTS(SELECT 1 FROM pg_locks WHERE locktype='advisory' AND NOT granted AND database=(SELECT oid FROM pg_database WHERE datname=current_database()))")
                        .fetch_one(&pool).await.unwrap();
                    if blocked { break; }
                    tokio::task::yield_now().await;
                }
            }).await.unwrap();
            tx.commit().await.unwrap();
            tokio::time::timeout(std::time::Duration::from_secs(3), erase)
                .await
                .unwrap()
                .unwrap()
                .unwrap();
        } else {
            guest_credentials::lock_players(&mut tx, vec![account])
                .await
                .unwrap();
            let adoption_pool = pool.clone();
            let adopt = tokio::spawn(async move {
                adopt_guest_sessions(&adoption_pool, &identity, &format!("guest_{guest}"), &hash)
                    .await
            });
            sqlx::query("DELETE FROM auth_subjects WHERE user_id=$1")
                .bind(account)
                .execute(&mut *tx)
                .await
                .unwrap();
            sqlx::query("DELETE FROM game_sessions WHERE user_id=$1")
                .bind(account)
                .execute(&mut *tx)
                .await
                .unwrap();
            tx.commit().await.unwrap();
            assert!(
                tokio::time::timeout(std::time::Duration::from_secs(3), adopt)
                    .await
                    .unwrap()
                    .unwrap()
                    .is_err()
            );
        }
        let account_rows: i64 = sqlx::query_scalar(
            "SELECT count(*) FROM game_sessions WHERE user_id=$1 OR adopted_from_guest=$1",
        )
        .bind(account)
        .fetch_one(&pool)
        .await
        .unwrap();
        assert_eq!(account_rows, 0);
        let source_rows: i64 = sqlx::query_scalar(
            "SELECT count(*) FROM game_sessions WHERE user_id=$1 OR adopted_from_guest=$1",
        )
        .bind(guest)
        .fetch_one(&pool)
        .await
        .unwrap();
        assert_eq!(source_rows, if adoption_first { 0 } else { 1 });
        let linked: i64 =
            sqlx::query_scalar("SELECT count(*) FROM guest_credentials WHERE adopted_user_id=$1")
                .bind(account)
                .fetch_one(&pool)
                .await
                .unwrap();
        assert_eq!(linked, 0);
    }
    pool.close().await;
}
