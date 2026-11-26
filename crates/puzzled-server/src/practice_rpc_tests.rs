//! Exercise the Connect routes against a migrated scratch database and Money stub.

use axum::body::{to_bytes, Body};
use axum::http::{Method, Request, StatusCode};
use axum::Router;
use serde_json::Value;
use tower::ServiceExt;

use super::{fresh_database, spawn_money, token, Fake, OUTAGE, PAID, UNPAID};

// Loaded via #[path] by money_access_tests, so child paths are relative to src/.
#[path = "practice_rpc_tests/access.rs"]
mod access;
#[path = "practice_rpc_tests/daily_picks.rs"]
mod daily_picks;
#[path = "practice_rpc_tests/game_fixtures.rs"]
mod game_fixtures;
#[path = "practice_rpc_tests/grading.rs"]
mod grading;

const SEED: i64 = 20_261_125;
const PRACTICE_RPCS: [&str; 3] = ["GetPracticePuzzle", "CheckPracticeGuess", "SubmitPractice"];

async fn rpc(
    app: &Router,
    method: &str,
    body: Value,
    account: Option<&str>,
    cookie: Option<&str>,
) -> (StatusCode, Value) {
    let mut req = Request::builder()
        .method(Method::POST)
        .uri(format!("/puzzled.v1.PuzzleService/{method}"))
        .header("content-type", "application/json")
        .header("connect-protocol-version", "1");
    if method == "StartDaily" {
        req = req.header(
            "origin",
            crate::shared::public_origin::public_origin().unwrap(),
        );
    }
    if let Some(jwt) = account {
        req = req.header("authorization", format!("Bearer {jwt}"));
    }
    if let Some(cookie) = cookie {
        req = req.header("cookie", cookie);
    }
    let res = app
        .clone()
        .oneshot(req.body(Body::from(body.to_string())).unwrap())
        .await
        .unwrap();
    let status = res.status();
    let bytes = to_bytes(res.into_body(), 1024 * 1024).await.unwrap();
    (status, serde_json::from_slice(&bytes).unwrap())
}

fn json_field(body: &Value, key: &str) -> Value {
    serde_json::from_str(body[key].as_str().unwrap()).unwrap()
}

async fn ritual_row_counts(pool: &sqlx::PgPool) -> (i64, i64) {
    sqlx::query_as(
        "SELECT (SELECT count(*) FROM daily_free_picks), (SELECT count(*) FROM game_sessions)",
    )
    .fetch_one(pool)
    .await
    .unwrap()
}

async fn assert_no_ritual_rows(pool: &sqlx::PgPool) {
    assert_eq!(ritual_row_counts(pool).await, (0, 0));
}

#[tokio::test]
async fn plus_practice_preserves_same_account_daily_picks_before_and_after() {
    daily_picks::plus_practice_preserves_same_account_daily_picks_before_and_after().await;
}

#[tokio::test]
async fn practice_requires_an_account_and_fails_closed_on_money_errors() {
    access::practice_requires_an_account_and_fails_closed_on_money_errors().await;
}

#[tokio::test]
async fn plus_can_finish_every_practice_game_without_using_the_daily_store() {
    grading::plus_can_finish_every_practice_game_without_using_the_daily_store().await;
}
