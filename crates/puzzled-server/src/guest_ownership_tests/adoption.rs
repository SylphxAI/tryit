use super::support::request;
use crate::test_support::{fresh_database, token};
use crate::{router, AppState};
use axum::http::StatusCode;
use serde_json::json;
use uuid::Uuid;

pub(super) async fn issued_cookie_is_fresh_host_only_and_progress_adopts_without_deleting_collisions(
) {
    use crate::capabilities::identity_access::adapters::guest_credentials;
    let Some(pool) = fresh_database().await else {
        return;
    };
    let app = router(AppState::new(Some(pool.clone())));
    let (status, body, cookie) = request(
        &app,
        "/v1/guest/session",
        None,
        None,
        Some(&Uuid::now_v7().to_string()),
    )
    .await;
    assert_eq!(status, StatusCode::OK);
    assert_eq!(body, json!({"issued":true}));
    let cookie = cookie.unwrap();
    assert!(cookie.starts_with("__Host-puzzled_guest="));
    for attribute in [
        "Path=/",
        "HttpOnly",
        "Secure",
        "SameSite=Lax",
        "Max-Age=34560000",
    ] {
        assert!(cookie.contains(attribute));
    }
    assert!(!cookie.contains("Domain="));
    let pair = cookie.split(';').next().unwrap();
    let raw = pair.split_once('=').unwrap().1;
    let hash = guest_credentials::token_hash(raw).unwrap();
    assert!(guest_credentials::lookup_hash(&pool, &hash)
        .await
        .unwrap()
        .is_none());
    let mut headers = axum::http::HeaderMap::new();
    headers.insert(
        guest_credentials::VERIFIED_GUEST_HEADER,
        hash.parse().unwrap(),
    );
    let first_write = crate::bootstrap::identity::admitted_request_identities(
        &connectrpc::RequestContext::new(headers),
        Some(&pool),
        true,
    )
    .await
    .unwrap();
    first_write.commit().await.unwrap();
    let guest = guest_credentials::lookup_hash(&pool, &hash)
        .await
        .unwrap()
        .unwrap();
    assert_eq!(guest.get_version_num(), 7);
    assert_ne!(hash, raw);
    let account = Uuid::now_v7();
    sqlx::query("INSERT INTO auth_subjects(subject,user_id) VALUES ($1,$2)")
        .bind(format!("principal-{account}"))
        .bind(account)
        .execute(&pool)
        .await
        .unwrap();
    let puzzle = Uuid::now_v7();
    // The fixture's null puzzle id avoids depending on a content row; ritual
    // collisions still name the same module and product day.
    let _ = puzzle;
    for player in [guest, account] {
        sqlx::query("INSERT INTO game_sessions(user_id,game_slug,status,attempts,mode,is_ritual,day_key) VALUES ($1,'word-guess','won',1,'daily',true,'2026-09-30')")
            .bind(player).execute(&pool).await.unwrap();
    }
    // Preserve the stored wall time of a pre-existing finish, not a newly derived instant.
    let (old_id, old_clock): (Uuid, chrono::NaiveDateTime) = sqlx::query_as(
        "INSERT INTO game_sessions (user_id, game_slug, status, attempts, mode, is_ritual, day_key, completed_at)
         VALUES ($1,'word-guess','won',1,'daily',true,'2026-09-29', TIMESTAMP '2026-09-28 23:45:00.123456')
         RETURNING id, completed_at",
    )
    .bind(guest)
    .fetch_one(&pool)
    .await
    .unwrap();
    assert_eq!(
        request(
            &app,
            "/puzzled.v1.StatsService/GetHistory",
            Some(pair),
            None,
            None
        )
        .await
        .0,
        StatusCode::OK
    );
    let account_token = token(&account.to_string());
    assert_eq!(
        request(
            &app,
            "/puzzled.v1.StatsService/GetHistory",
            Some(pair),
            Some(&account_token),
            None
        )
        .await
        .0,
        StatusCode::OK
    );
    let rows: i64 = sqlx::query_scalar("SELECT count(*) FROM game_sessions")
        .fetch_one(&pool)
        .await
        .unwrap();
    assert_eq!(rows, 3);
    let adopted: i64 = sqlx::query_scalar(
        "SELECT count(*) FROM game_sessions WHERE user_id=$1 AND adopted_from_guest=$2",
    )
    .bind(account)
    .bind(guest)
    .fetch_one(&pool)
    .await
    .unwrap();
    assert_eq!(adopted, 1);
    let adopted_row: (Uuid, Uuid, chrono::NaiveDateTime, String) = sqlx::query_as(
        "SELECT user_id, adopted_from_guest, completed_at, day_key FROM game_sessions WHERE id = $1",
    )
    .bind(old_id)
    .fetch_one(&pool)
    .await
    .unwrap();
    assert_eq!(
        adopted_row,
        (account, guest, old_clock, "2026-09-29".into())
    );
    assert!(guest_credentials::lookup_hash(&pool, &hash)
        .await
        .unwrap()
        .is_none());
    assert_eq!(
        request(
            &app,
            "/puzzled.v1.StatsService/GetHistory",
            Some(pair),
            None,
            None
        )
        .await
        .0,
        StatusCode::UNAUTHORIZED
    );
    pool.close().await;
}

pub(super) async fn freeze_failure_rolls_back_adoption_and_keeps_credential_live() {
    use crate::capabilities::identity_access::adapters::guest_credentials;
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
    sqlx::query("INSERT INTO auth_subjects(subject,user_id) VALUES ($1,$2)")
        .bind(format!("principal-{account}"))
        .bind(account)
        .execute(&pool)
        .await
        .unwrap();
    sqlx::query("INSERT INTO game_sessions(user_id,game_slug,status,attempts,mode) VALUES ($1,'word-guess','won',1,'daily')")
        .bind(guest).execute(&pool).await.unwrap();
    sqlx::query("INSERT INTO user_freeze_data(user_id,freezes_available) VALUES($1,1)")
        .bind(guest)
        .execute(&pool)
        .await
        .unwrap();
    sqlx::raw_sql("CREATE FUNCTION fail_freeze_insert() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'test rollback'; END $$; CREATE TRIGGER fail_freeze_insert BEFORE INSERT ON user_freeze_data FOR EACH ROW EXECUTE FUNCTION fail_freeze_insert();")
        .execute(&pool).await.unwrap();
    let app = router(AppState::new(Some(pool.clone())));
    let signed = token(&account.to_string());
    assert_eq!(
        request(
            &app,
            "/puzzled.v1.StatsService/GetHistory",
            Some(pair),
            Some(&signed),
            None
        )
        .await
        .0,
        StatusCode::INTERNAL_SERVER_ERROR
    );
    let owners: Vec<Uuid> = sqlx::query_scalar("SELECT user_id FROM game_sessions")
        .fetch_all(&pool)
        .await
        .unwrap();
    assert_eq!(owners, [guest]);
    assert_eq!(
        guest_credentials::lookup_hash(&pool, &hash).await.unwrap(),
        Some(guest)
    );
    let freeze_owner: Uuid = sqlx::query_scalar("SELECT user_id FROM user_freeze_data")
        .fetch_one(&pool)
        .await
        .unwrap();
    assert_eq!(freeze_owner, guest);
    pool.close().await;
}

pub(super) async fn private_access_lease_serializes_adoption_and_revocation() {
    use crate::bootstrap::identity::admitted_request_identities;
    use crate::capabilities::identity_access::adapters::guest_credentials;
    let Some(pool) = fresh_database().await else {
        return;
    };
    let cookie = guest_credentials::issue(&pool).await.unwrap();
    let pair = cookie.split(';').next().unwrap().to_string();
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
    let mut headers = axum::http::HeaderMap::new();
    headers.insert(
        guest_credentials::VERIFIED_GUEST_HEADER,
        hash.parse().unwrap(),
    );
    let context = connectrpc::RequestContext::new(headers);
    let mut access = admitted_request_identities(&context, Some(&pool), false)
        .await
        .unwrap();
    let app = router(AppState::new(Some(pool.clone())));
    let signed = token(&account.to_string());
    let account_app = app.clone();
    let account_cookie = pair.clone();
    let adoption = tokio::spawn(async move {
        request(
            &account_app,
            "/puzzled.v1.StatsService/GetHistory",
            Some(&account_cookie),
            Some(&signed),
            None,
        )
        .await
        .0
    });
    // Wait for an observed database lock waiter, not a guessed wall-clock delay.
    tokio::time::timeout(std::time::Duration::from_secs(5), async {
        loop {
            let waiting: bool = sqlx::query_scalar("SELECT EXISTS (SELECT 1 FROM pg_locks WHERE locktype='advisory' AND NOT granted AND database=(SELECT oid FROM pg_database WHERE datname=current_database()))")
                .fetch_one(&pool).await.unwrap();
            if waiting { break; }
            tokio::task::yield_now().await;
        }
    }).await.unwrap();
    assert!(!adoption.is_finished());
    sqlx::query("INSERT INTO game_sessions(user_id,game_slug,status,attempts,mode) VALUES($1,'word-guess','won',1,'daily')")
        .bind(guest).execute(access.connection().unwrap()).await.unwrap();
    access.commit().await.unwrap();
    assert_eq!(adoption.await.unwrap(), StatusCode::OK);
    let owners: Vec<Uuid> = sqlx::query_scalar("SELECT user_id FROM game_sessions")
        .fetch_all(&pool)
        .await
        .unwrap();
    assert_eq!(owners, [account]);
    assert_eq!(
        request(
            &app,
            "/puzzled.v1.StatsService/GetHistory",
            Some(&pair),
            None,
            None
        )
        .await
        .0,
        StatusCode::UNAUTHORIZED
    );
    pool.close().await;
}
