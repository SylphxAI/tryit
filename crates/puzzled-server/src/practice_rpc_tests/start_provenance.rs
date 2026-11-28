//! StartDaily records start provenance from the request itself.
use axum::body::{to_bytes, Body};
use axum::http::{Method, Request, StatusCode};
use serde_json::{json, Value};
use tower::ServiceExt;

use super::fresh_database;
use crate::{router, AppState};

#[rustfmt::skip]
pub(super) async fn accepted_starts_record_provenance_and_refused_starts_record_nothing() {
    let Some(pool) = fresh_database().await else { return };
    let app = router(AppState::new(Some(pool.clone())));
    let today = puzzled_core::puzzle_play::daily_time::product_day_key(chrono::Utc::now());
    let mut cookies = Vec::new();
    for _ in 0..4 {
        let set = crate::capabilities::identity_access::adapters::guest_credentials::issue_with_first_candidate(&pool, uuid::Uuid::now_v7()).await.unwrap();
        cookies.push(set.split(';').next().unwrap().to_string());
    }
    let start = |cookie: String, date: String, extra: Option<(&'static str, &'static str)>| {
        let mut req = Request::builder().method(Method::POST).uri("/puzzled.v1.PuzzleService/StartDaily")
            .header("content-type", "application/json").header("connect-protocol-version", "1")
            .header("origin", crate::shared::public_origin::public_origin().unwrap())
            .header("cookie", cookie);
        if let Some((k, v)) = extra { req = req.header(k, v); }
        let body = json!({"gameSlug": "sudoku", "puzzleDate": date}).to_string();
        let app = app.clone();
        async move {
            let res = app.oneshot(req.body(Body::from(body)).unwrap()).await.unwrap();
            let status = res.status();
            let bytes = to_bytes(res.into_body(), 1 << 20).await.unwrap();
            (status, serde_json::from_slice::<Value>(&bytes).unwrap_or(Value::Null))
        }
    };
    // Refused: a future day claims nothing.
    let (status, _) = start(cookies[0].clone(), (today + chrono::Duration::days(1)).to_string(), None).await;
    assert_ne!(status, StatusCode::OK);
    let count: i64 = sqlx::query_scalar("SELECT count(*) FROM daily_free_picks").fetch_one(&pool).await.unwrap();
    assert_eq!(count, 0);
    for (cookie, extra) in [(1, None), (2, Some(("x-puzzled-verification", "1"))), (3, Some(("user-agent", "puzzled-verify-live/1 ci")))] {
        let (status, body) = start(cookies[cookie].clone(), today.to_string(), extra).await;
        assert_eq!(status, StatusCode::OK, "{body}");
    }
    let rows: Vec<(Option<String>, Option<bool>, Option<bool>)> = sqlx::query_as("SELECT claimed_via,guest_entry,comparison_excluded FROM daily_free_picks ORDER BY comparison_excluded, started_at")
        .fetch_all(&pool).await.unwrap();
    let start_row = |cmp: bool| (Some("start".to_string()), Some(true), Some(cmp));
    assert_eq!(rows, vec![start_row(false), start_row(true), start_row(true)]);
}
