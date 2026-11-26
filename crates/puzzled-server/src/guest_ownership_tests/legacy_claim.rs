use super::support::{bootstrap, puzzle_request, request};
use crate::test_support::{fresh_database, token};
use crate::{router, AppState};
use axum::http::StatusCode;
use serde_json::json;
use uuid::Uuid;

const ORIGIN: &str = "https://puzzled.gg";

async fn seed_legacy_progress(pool: &sqlx::PgPool, legacy: Uuid) {
    for day in ["2026-09-01", "2026-09-02"] {
        sqlx::query("INSERT INTO game_sessions(user_id,game_slug,status,attempts,mode,is_ritual,day_key) VALUES($1,'word-guess','won',2,'daily',true,$2::date)")
            .bind(legacy).bind(day).execute(pool).await.unwrap();
    }
    sqlx::query("INSERT INTO streak_freeze_uses(user_id,day_key) VALUES($1,'2026-09-03')")
        .bind(legacy)
        .execute(pool)
        .await
        .unwrap();
}

async fn rows_for(pool: &sqlx::PgPool, player: Uuid) -> (i64, i64) {
    let sessions = sqlx::query_scalar("SELECT count(*) FROM game_sessions WHERE user_id=$1")
        .bind(player)
        .fetch_one(pool)
        .await
        .unwrap();
    let freezes = sqlx::query_scalar("SELECT count(*) FROM streak_freeze_uses WHERE user_id=$1")
        .bind(player)
        .fetch_one(pool)
        .await
        .unwrap();
    (sessions, freezes)
}

fn token_of(cookies: &[String]) -> String {
    cookies
        .iter()
        .find(|c| c.starts_with("__Host-puzzled_guest="))
        .unwrap()
        .split(';')
        .next()
        .unwrap()
        .to_string()
}

async fn player_of(pool: &sqlx::PgPool, pair: &str) -> Option<Uuid> {
    use crate::capabilities::identity_access::adapters::guest_credentials as g;
    let hash = g::token_hash(pair.split_once('=').unwrap().1).unwrap();
    g::lookup_hash(pool, &hash).await.unwrap()
}

#[tokio::test]
async fn legacy_claim_keeps_streak_and_history_and_leaves_nothing_under_legacy() {
    let Some(pool) = fresh_database().await else {
        return;
    };
    let legacy = Uuid::now_v7();
    seed_legacy_progress(&pool, legacy).await;
    let app = router(AppState::new(Some(pool.clone())));
    let cookie = format!("puzzled_guest_id={legacy}");
    let (status, body, cookies) = bootstrap(&app, ORIGIN, Some(&cookie), json!({})).await;
    assert_eq!(status, StatusCode::OK);
    assert_eq!(body["claimed"], true);
    assert!(cookies
        .iter()
        .any(|c| c == "puzzled_guest_id=; Path=/; Max-Age=0"));
    let fresh = player_of(&pool, &token_of(&cookies)).await.unwrap();
    assert_ne!(fresh, legacy);
    assert_eq!(rows_for(&pool, fresh).await, (2, 1));
    assert_eq!(rows_for(&pool, legacy).await, (0, 0));
    let from: i64 = sqlx::query_scalar(
        "SELECT count(*) FROM game_sessions WHERE user_id=$1 AND adopted_from_guest=$2",
    )
    .bind(fresh)
    .bind(legacy)
    .fetch_one(&pool)
    .await
    .unwrap();
    assert_eq!(from, 2);
    // The body field carries the id too, and the history reads through the new cookie.
    let (status, history, _) = request(
        &app,
        "/puzzled.v1.StatsService/GetHistory",
        Some(&token_of(&cookies)),
        None,
        None,
    )
    .await;
    assert_eq!(status, StatusCode::OK, "{history}");
    pool.close().await;
}

#[tokio::test]
async fn replaying_the_legacy_id_with_another_token_claims_nothing() {
    let Some(pool) = fresh_database().await else {
        return;
    };
    let legacy = Uuid::now_v7();
    seed_legacy_progress(&pool, legacy).await;
    let app = router(AppState::new(Some(pool.clone())));
    let (_, first, first_cookies) =
        bootstrap(&app, ORIGIN, None, json!({"legacyGuestId": legacy})).await;
    assert_eq!(first["claimed"], true);
    let first_player = player_of(&pool, &token_of(&first_cookies)).await.unwrap();
    let (status, second, second_cookies) =
        bootstrap(&app, ORIGIN, None, json!({"legacyGuestId": legacy})).await;
    assert_eq!(status, StatusCode::OK);
    assert_ne!(second["claimed"], true);
    assert!(!second_cookies
        .iter()
        .any(|c| c.starts_with("puzzled_guest_id=")));
    assert!(player_of(&pool, &token_of(&second_cookies)).await.is_none());
    assert_eq!(rows_for(&pool, first_player).await, (2, 1));
    pool.close().await;
}

#[tokio::test]
async fn account_backed_or_registered_legacy_id_is_refused() {
    let Some(pool) = fresh_database().await else {
        return;
    };
    let app = router(AppState::new(Some(pool.clone())));
    let account = Uuid::now_v7();
    sqlx::query("INSERT INTO auth_subjects(subject,user_id) VALUES($1,$2)")
        .bind(format!("principal-{account}"))
        .bind(account)
        .execute(&pool)
        .await
        .unwrap();
    seed_legacy_progress(&pool, account).await;
    let (status, body, _) = bootstrap(&app, ORIGIN, None, json!({"legacyGuestId": account})).await;
    assert_eq!((status, &body["claimed"]), (StatusCode::OK, &json!(null)));
    assert_eq!(rows_for(&pool, account).await, (2, 1));

    use crate::capabilities::identity_access::adapters::guest_credentials as g;
    let registered_cookie = g::issue(&pool).await.unwrap();
    let registered = player_of(&pool, registered_cookie.split(';').next().unwrap())
        .await
        .unwrap();
    seed_legacy_progress(&pool, registered).await;
    let (_, body, cookies) =
        bootstrap(&app, ORIGIN, None, json!({"legacyGuestId": registered})).await;
    assert_ne!(body["claimed"], true);
    assert!(player_of(&pool, &token_of(&cookies)).await.is_none());
    assert_eq!(rows_for(&pool, registered).await, (2, 1));
    pool.close().await;
}

#[tokio::test]
async fn two_concurrent_legacy_claims_have_exactly_one_winner() {
    let Some(pool) = fresh_database().await else {
        return;
    };
    let legacy = Uuid::now_v7();
    seed_legacy_progress(&pool, legacy).await;
    let app = router(AppState::new(Some(pool.clone())));
    let run = || {
        let app = app.clone();
        async move { bootstrap(&app, ORIGIN, None, json!({"legacyGuestId": legacy})).await }
    };
    let (a, b) = tokio::join!(run(), run());
    let wins = [&a, &b].iter().filter(|r| r.1["claimed"] == true).count();
    assert_eq!(wins, 1);
    let registered: i64 = sqlx::query_scalar("SELECT count(*) FROM guest_credentials")
        .fetch_one(&pool)
        .await
        .unwrap();
    assert_eq!(registered, 1);
    assert_eq!(rows_for(&pool, legacy).await, (0, 0));
    let total: i64 = sqlx::query_scalar("SELECT count(*) FROM game_sessions")
        .fetch_one(&pool)
        .await
        .unwrap();
    assert_eq!(total, 2);
    pool.close().await;
}

#[tokio::test]
async fn wrong_origin_legacy_claim_is_forbidden_without_database_effect() {
    let Some(pool) = fresh_database().await else {
        return;
    };
    let legacy = Uuid::now_v7();
    seed_legacy_progress(&pool, legacy).await;
    let app = router(AppState::new(Some(pool.clone())));
    let (status, _, cookies) = bootstrap(
        &app,
        "https://elsewhere.invalid",
        None,
        json!({"legacyGuestId": legacy}),
    )
    .await;
    assert_eq!(status, StatusCode::FORBIDDEN);
    assert!(cookies.is_empty());
    assert_eq!(rows_for(&pool, legacy).await, (2, 1));
    let registered: i64 = sqlx::query_scalar("SELECT count(*) FROM guest_credentials")
        .fetch_one(&pool)
        .await
        .unwrap();
    assert_eq!(registered, 0);
    pool.close().await;
}

#[tokio::test]
async fn signed_in_player_with_legacy_id_ends_with_history_on_the_account() {
    let Some(pool) = fresh_database().await else {
        return;
    };
    let day = puzzled_core::puzzle_play::daily_time::product_day_key(chrono::Utc::now());
    let puzzle = crate::capabilities::daily_pipeline::resolve(Some(&pool), "word-guess", day, None)
        .await
        .unwrap();
    let valid = json!({"gameSlug":"word-guess","status":"won","attempts":1,
        "submissionJson":json!({"guesses":[puzzle.solution["word"]]}).to_string()});
    let legacy = Uuid::now_v7();
    seed_legacy_progress(&pool, legacy).await;
    let account = Uuid::now_v7();
    sqlx::query("INSERT INTO auth_subjects(subject,user_id) VALUES($1,$2)")
        .bind(format!("principal-{account}"))
        .bind(account)
        .execute(&pool)
        .await
        .unwrap();
    let app = router(AppState::new(Some(pool.clone())));
    let (_, body, cookies) = bootstrap(&app, ORIGIN, None, json!({"legacyGuestId": legacy})).await;
    assert_eq!(body["claimed"], true);
    let pair = token_of(&cookies);
    let bearer = token(&account.to_string());
    let (_, body) = puzzle_request(&app, "SubmitGuess", &pair, Some(&bearer), valid).await;
    assert_eq!(body["valid"], true);
    assert_eq!(rows_for(&pool, legacy).await, (0, 0));
    let (sessions, freezes) = rows_for(&pool, account).await;
    assert!(sessions >= 2 && freezes == 1, "{sessions} {freezes}");
    pool.close().await;
}
