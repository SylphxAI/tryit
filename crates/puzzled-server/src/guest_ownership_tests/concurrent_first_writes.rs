use crate::test_support::fresh_database;
use crate::{router, AppState};
use axum::body::Body;
use axum::http::{Request, StatusCode};
use serde_json::json;
use tower::ServiceExt;

#[tokio::test]
async fn four_concurrent_submits_with_two_connections_do_not_hold_pool_during_content_lookup() {
    use crate::capabilities::identity_access::adapters::guest_credentials;
    let Some(admin_pool) = fresh_database().await else {
        return;
    };
    let options = admin_pool.connect_options();
    let pool = sqlx::postgres::PgPoolOptions::new()
        .max_connections(2)
        .acquire_timeout(std::time::Duration::from_secs(2))
        .connect_with((*options).clone())
        .await
        .unwrap();
    let day = puzzled_core::puzzle_play::daily_time::product_day_key(chrono::Utc::now());
    let slug = "word-guess";
    let puzzle = crate::capabilities::daily_pipeline::resolve(Some(&pool), slug, day, None)
        .await
        .unwrap();
    let submission = json!({"guesses": [puzzle.solution["word"]]}).to_string();
    let cookie = guest_credentials::mint_cookie(None).unwrap();
    let pair = cookie.split(';').next().unwrap().to_string();
    let app = router(AppState::new(Some(pool.clone())));
    let mut tasks = Vec::new();
    for _ in 0..4 {
        let app = app.clone();
        let cookie = pair.clone();
        let submission = submission.clone();
        tasks.push(tokio::spawn(async move {
            let body =
                json!({"gameSlug":slug,"status":"won","attempts":1,"submissionJson":submission});
            let response = app
                .oneshot(
                    Request::builder()
                        .method("POST")
                        .uri("/puzzled.v1.PuzzleService/SubmitGuess")
                        .header("content-type", "application/json")
                        .header("cookie", cookie)
                        .body(Body::from(body.to_string()))
                        .unwrap(),
                )
                .await
                .unwrap();
            assert!(matches!(
                response.status(),
                StatusCode::OK | StatusCode::CONFLICT
            ));
        }));
    }
    tokio::time::timeout(std::time::Duration::from_secs(8), async {
        for task in tasks {
            task.await.unwrap();
        }
    })
    .await
    .unwrap();
    let count: i64 = sqlx::query_scalar("SELECT count(*) FROM guest_credentials")
        .fetch_one(&pool)
        .await
        .unwrap();
    assert_eq!(count, 1);
    let hash = guest_credentials::token_hash(pair.split_once('=').unwrap().1).unwrap();
    let guest = guest_credentials::lookup_hash(&pool, &hash)
        .await
        .unwrap()
        .unwrap();
    assert_eq!(guest.get_version_num(), 7);
    let sessions: i64 = sqlx::query_scalar("SELECT count(*) FROM game_sessions")
        .fetch_one(&pool)
        .await
        .unwrap();
    assert_eq!(sessions, 1);
    pool.close().await;
    admin_pool.close().await;
}

#[tokio::test]
async fn fifty_parallel_first_write_pairs_keep_one_winning_namespace_each() {
    use crate::capabilities::identity_access::adapters::guest_credentials;
    let Some(pool) = fresh_database().await else {
        return;
    };
    let day = puzzled_core::puzzle_play::daily_time::product_day_key(chrono::Utc::now());
    let slug = "word-guess";
    let puzzle = crate::capabilities::daily_pipeline::resolve(Some(&pool), slug, day, None)
        .await
        .unwrap();
    let submission = json!({"guesses": [puzzle.solution["word"]]}).to_string();
    let app = router(AppState::new(Some(pool.clone())));
    async fn submit(app: axum::Router, cookie: String, slug: &'static str, submission: String) {
        let body = json!({"gameSlug":slug,"status":"won","attempts":1,"submissionJson":submission});
        let response = app
            .oneshot(
                Request::builder()
                    .method("POST")
                    .uri("/puzzled.v1.PuzzleService/SubmitGuess")
                    .header("content-type", "application/json")
                    .header("cookie", cookie)
                    .body(Body::from(body.to_string()))
                    .unwrap(),
            )
            .await
            .unwrap();
        assert!(matches!(
            response.status(),
            StatusCode::OK | StatusCode::CONFLICT
        ));
    }
    for iteration in 0..50 {
        let cookie = guest_credentials::mint_cookie(None).unwrap();
        let pair = cookie.split(';').next().unwrap().to_string();
        let first = tokio::spawn(submit(app.clone(), pair.clone(), slug, submission.clone()));
        let second = tokio::spawn(submit(app.clone(), pair.clone(), slug, submission.clone()));
        tokio::time::timeout(std::time::Duration::from_secs(8), async {
            first.await.unwrap();
            second.await.unwrap();
        })
        .await
        .unwrap();
        let hash = guest_credentials::token_hash(pair.split_once('=').unwrap().1).unwrap();
        let count: i64 =
            sqlx::query_scalar("SELECT count(*) FROM guest_credentials WHERE token_hash=$1")
                .bind(hash)
                .fetch_one(&pool)
                .await
                .unwrap();
        assert_eq!(count, 1, "iteration {iteration}");
    }
    let count: i64 = sqlx::query_scalar("SELECT count(DISTINCT user_id) FROM guest_credentials")
        .fetch_one(&pool)
        .await
        .unwrap();
    assert_eq!(count, 50);
    let sessions: i64 = sqlx::query_scalar("SELECT count(*) FROM game_sessions")
        .fetch_one(&pool)
        .await
        .unwrap();
    assert_eq!(sessions, 50);
    pool.close().await;
}
