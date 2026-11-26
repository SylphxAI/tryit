use super::support::request;
use crate::test_support::{fresh_database, token};
use crate::{router, AppState};
use axum::body::Body;
use axum::http::{Request, StatusCode};
use serde_json::json;
use tower::ServiceExt;
use uuid::Uuid;

pub(super) async fn unsigned_ids_and_forged_internal_headers_cannot_read_or_adopt() {
    let Some(pool) = fresh_database().await else {
        return;
    };
    let a = Uuid::now_v7();
    let b = Uuid::now_v7();
    sqlx::query("INSERT INTO auth_subjects(subject,user_id) VALUES ($1,$2),($3,$4)")
        .bind(format!("principal-{a}"))
        .bind(a)
        .bind(format!("principal-{b}"))
        .bind(b)
        .execute(&pool)
        .await
        .unwrap();
    sqlx::query("INSERT INTO game_sessions(user_id,game_slug,status,attempts,mode) VALUES ($1,'word-guess','won',1,'daily')")
        .bind(a).execute(&pool).await.unwrap();
    let app = router(AppState::new(Some(pool.clone())));
    let b_token = token(&b.to_string());
    for path in [
        "/puzzled.v1.StatsService/GetHistory",
        "/puzzled.v1.StatsService/GetUserStats",
        "/puzzled.v1.GamificationService/GetStreakInfo",
    ] {
        let legacy = format!("puzzled_guest_id={a}");
        let (status, _, _) = request(&app, path, Some(&legacy), None, Some(&a.to_string())).await;
        assert_eq!(status, StatusCode::UNAUTHORIZED);
        let (status, body, _) = request(
            &app,
            path,
            Some(&legacy),
            Some(&b_token),
            Some(&a.to_string()),
        )
        .await;
        assert_eq!(status, StatusCode::OK);
        if path.ends_with("GetHistory") {
            assert!(body
                .get("sessions")
                .is_none_or(|v| v.as_array().unwrap().is_empty()));
        }
        let owners: Vec<Uuid> =
            sqlx::query_scalar("SELECT user_id FROM game_sessions ORDER BY user_id")
                .fetch_all(&pool)
                .await
                .unwrap();
        assert_eq!(owners, [a]);
    }
    pool.close().await;
}

pub(super) async fn allocation_collision_never_aliases_existing_account_or_guest() {
    use crate::capabilities::identity_access::adapters::{auth_subjects, guest_credentials};
    let Some(pool) = fresh_database().await else {
        return;
    };
    let account = Uuid::now_v7();
    sqlx::query("INSERT INTO auth_subjects(subject,user_id) VALUES($1,$2)")
        .bind(format!("principal-{account}"))
        .bind(account)
        .execute(&pool)
        .await
        .unwrap();
    let cookie = guest_credentials::issue_with_first_candidate(&pool, account)
        .await
        .unwrap();
    let hash =
        guest_credentials::token_hash(cookie.split(';').next().unwrap().split_once('=').unwrap().1)
            .unwrap();
    let guest = guest_credentials::lookup_hash(&pool, &hash)
        .await
        .unwrap()
        .unwrap();
    assert_ne!(guest, account);
    assert_eq!(guest.get_version_num(), 7);
    let remapped = auth_subjects::player_for(&pool, &format!("principal-{guest}"), None)
        .await
        .unwrap();
    assert_ne!(remapped, guest);
    assert_eq!(remapped.get_version_num(), 7);
    assert_eq!(
        guest_credentials::lookup_hash(&pool, &hash).await.unwrap(),
        Some(guest)
    );
    pool.close().await;
}

pub(super) async fn second_guest_cookie_never_reads_or_adopts_a_public_player_id() {
    use crate::capabilities::identity_access::adapters::guest_credentials;
    let Some(pool) = fresh_database().await else {
        return;
    };
    let app = router(AppState::new(Some(pool.clone())));
    let a_cookie = guest_credentials::issue(&pool).await.unwrap();
    let b_cookie = guest_credentials::issue(&pool).await.unwrap();
    let a_pair = a_cookie.split(';').next().unwrap();
    let b_pair = b_cookie.split(';').next().unwrap();
    let a_hash = guest_credentials::token_hash(a_pair.split_once('=').unwrap().1).unwrap();
    let b_hash = guest_credentials::token_hash(b_pair.split_once('=').unwrap().1).unwrap();
    let a = guest_credentials::lookup_hash(&pool, &a_hash)
        .await
        .unwrap()
        .unwrap();
    let b = guest_credentials::lookup_hash(&pool, &b_hash)
        .await
        .unwrap()
        .unwrap();
    for (player, attempts) in [(a, 7), (b, 2)] {
        sqlx::query("INSERT INTO game_sessions(user_id,game_slug,status,attempts,mode) VALUES($1,'word-guess','won',$2,'daily')")
            .bind(player).bind(attempts).execute(&pool).await.unwrap();
    }
    let (status, body, _) = request(
        &app,
        "/puzzled.v1.StatsService/GetHistory",
        Some(b_pair),
        None,
        Some(&a.to_string()),
    )
    .await;
    assert_eq!(status, StatusCode::OK);
    let sessions = body["sessions"].as_array().unwrap();
    assert_eq!(sessions.len(), 1);
    assert_eq!(sessions[0]["attempts"], 2);
    let account = Uuid::now_v7();
    sqlx::query("INSERT INTO auth_subjects(subject,user_id) VALUES($1,$2)")
        .bind(format!("principal-{account}"))
        .bind(account)
        .execute(&pool)
        .await
        .unwrap();
    assert_eq!(
        request(
            &app,
            "/puzzled.v1.StatsService/GetHistory",
            Some(b_pair),
            Some(&token(&account.to_string())),
            Some(&a.to_string())
        )
        .await
        .0,
        StatusCode::OK
    );
    let a_owner: Uuid = sqlx::query_scalar("SELECT user_id FROM game_sessions WHERE attempts=7")
        .fetch_one(&pool)
        .await
        .unwrap();
    let b_owner: Uuid = sqlx::query_scalar("SELECT user_id FROM game_sessions WHERE attempts=2")
        .fetch_one(&pool)
        .await
        .unwrap();
    assert_eq!(a_owner, a);
    assert_eq!(b_owner, account);
    assert_eq!(
        guest_credentials::lookup_hash(&pool, &a_hash)
            .await
            .unwrap(),
        Some(a)
    );
    assert_eq!(
        guest_credentials::lookup_hash(&pool, &b_hash)
            .await
            .unwrap(),
        None
    );
    pool.close().await;
}

pub(super) async fn legacy_guest_write_and_completion_paths_have_no_player_effects() {
    let Some(pool) = fresh_database().await else {
        return;
    };
    let legacy = Uuid::now_v7();
    sqlx::query("INSERT INTO game_sessions(user_id,game_slug,status,attempts,mode) VALUES($1,'word-guess','won',1,'daily')")
        .bind(legacy).execute(&pool).await.unwrap();
    let app = router(AppState::new(Some(pool.clone())));
    let cookie = format!("puzzled_guest_id={legacy}");
    let cases = [
        (
            "/puzzled.v1.PuzzleService/SubmitGuess",
            json!({"gameSlug":"word-guess","status":"won","attempts":1,"submissionJson":"{}"}),
        ),
        (
            "/puzzled.v1.PuzzleService/CheckGuess",
            json!({"gameSlug":"word-guess","guessJson":"{}"}),
        ),
        (
            "/puzzled.v1.PuzzleService/ShareResult",
            json!({"gameSlug":"word-guess","tap":true}),
        ),
    ];
    for (path, body) in cases {
        let response = app
            .clone()
            .oneshot(
                Request::builder()
                    .method("POST")
                    .uri(path)
                    .header("content-type", "application/json")
                    .header("cookie", &cookie)
                    .header("x-puzzled-guest-id", legacy.to_string())
                    .body(Body::from(body.to_string()))
                    .unwrap(),
            )
            .await
            .unwrap();
        assert_eq!(response.status(), StatusCode::UNAUTHORIZED, "{path}");
    }
    let rows: Vec<(Uuid, i32)> = sqlx::query_as("SELECT user_id,attempts FROM game_sessions")
        .fetch_all(&pool)
        .await
        .unwrap();
    assert_eq!(rows, [(legacy, 1)]);
    for table in ["result_shares", "user_freeze_data", "guest_credentials"] {
        let statement = format!("SELECT count(*) FROM {table}");
        let count: i64 = sqlx::query_scalar(sqlx::AssertSqlSafe(statement))
            .fetch_one(&pool)
            .await
            .unwrap();
        assert_eq!(count, 0, "{table}");
    }
    pool.close().await;
}
