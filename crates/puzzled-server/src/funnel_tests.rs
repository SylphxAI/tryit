//! Exercise the anonymous funnel through JSON Connect and read back plain SQL.
//! Needs `PUZZLED_TEST_DATABASE_URL` like the other database tests.

mod daily_completion;
mod pick_completion;

use axum::{
    body::Body,
    http::{Request, StatusCode},
    Router,
};
use serde_json::{json, Value};
use tower::ServiceExt;

use crate::capabilities::funnel::{insert, record_signup, validate_browser, Incoming};
use crate::test_support::fresh_database;

fn row(json: &str) -> crate::capabilities::funnel::Row {
    validate_browser(&serde_json::from_str::<Incoming>(json).unwrap()).unwrap()
}

#[tokio::test]
async fn landing_game_start_signup_and_web_vitals_are_counted() {
    let Some(pool) = fresh_database().await else {
        return;
    };
    assert_four_events_and_signup_retry_safety(&pool, &uuid::Uuid::now_v7().to_string()).await;
}

pub(crate) async fn assert_four_events_and_signup_retry_safety(pool: &sqlx::PgPool, player: &str) {
    insert(pool, &row(r#"{"event":"landing","path":"/"}"#))
        .await
        .unwrap();
    insert(
        pool,
        &row(r#"{"event":"game_start","game_slug":"word-guess"}"#),
    )
    .await
    .unwrap();
    let (first, retry) = tokio::join!(record_signup(pool, player), record_signup(pool, player));
    first.unwrap();
    retry.unwrap();
    record_signup(pool, player).await.unwrap();
    insert(
        pool,
        &row(r#"{"event":"web_vitals","metric":"LCP","value":1800,"rating":"good","path":"/"}"#),
    )
    .await
    .unwrap();
    let counts: Vec<(String, i64)> =
        sqlx::query_as(r#"SELECT "event", count(*) FROM "funnel_events" WHERE "params" IS NULL GROUP BY 1 ORDER BY 1"#)
            .fetch_all(pool)
            .await
            .unwrap();
    assert_eq!(
        counts,
        vec![
            ("game_start".to_owned(), 1),
            ("landing".to_owned(), 1),
            ("signup".to_owned(), 1),
            ("web_vitals".to_owned(), 1),
        ]
    );
}

async fn post_event(app: &Router, origin: &str, fetch_site: &str, input: &Value) -> StatusCode {
    let request = Request::post("/puzzled.v1.FunnelService/RecordEvent")
        .header("content-type", "application/json")
        .header("connect-protocol-version", "1")
        .header("origin", origin)
        .header("sec-fetch-site", fetch_site)
        .body(Body::from(input.to_string()))
        .unwrap_or_else(|e| panic!("build funnel request: {e}"));
    app.clone()
        .oneshot(request)
        .await
        .unwrap_or_else(|e| panic!("call funnel: {e}"))
        .status()
}

#[tokio::test]
async fn same_origin_behavioral_events_persist_only_exact_params() {
    let Some(pool) = fresh_database().await else {
        return;
    };
    let app = crate::router(crate::AppState::new(Some(pool.clone())));
    let origin = crate::shared::public_origin::public_origin().unwrap_or_else(|e| panic!("{e}"));
    let cases = [
        (
            json!({
                "event":"game_complete", "gameSlug":"queens", "mode":"archive", "status":"lost",
                "pickIndex":null, "timeBucketS":0, "isGuest":false, "path":"/pricing",
                "metric":"LCP", "value":100, "rating":"good", "hintCount":2,
                "userId":"private", "answer":"private", "params":{"private":true},
            }),
            Some("crowns"),
            json!({"mode":"archive","status":"lost","pick_index":null,"time_bucket_s":0,"is_guest":false}),
        ),
        (
            json!({"event":"game_complete","gameSlug":"sudoku","mode":"practice","status":"won","timeBucketS":1800,"isGuest":true}),
            Some("sudoku"),
            json!({"mode":"practice","status":"won","pick_index":null,"time_bucket_s":1800,"is_guest":true}),
        ),
        (
            json!({"event":"game_abandon","gameSlug":"sudoku","mode":"daily","progressPctBucket":0,"isGuest":false}),
            Some("sudoku"),
            json!({"mode":"daily","progress_pct_bucket":0,"is_guest":false}),
        ),
        (
            json!({"event":"hint_used","gameSlug":"sudoku","mode":"practice","hintCount":100}),
            Some("sudoku"),
            json!({"mode":"practice","hint_count":100}),
        ),
        (
            json!({"event":"share_clicked","gameSlug":"sudoku","action":"save_png","hasPercentile":false}),
            Some("sudoku"),
            json!({"action":"save_png","has_percentile":false}),
        ),
        (
            json!({"event":"paywall_hit","gameSlug":"sudoku","surface":"archive_lock","picksUsed":0,"currency":"HKD","isGuest":true}),
            Some("sudoku"),
            json!({"surface":"archive_lock","picks_used":0,"currency":"HKD","is_guest":true}),
        ),
        (
            json!({"event":"pwa_install_prompted","platform":"ios_guide","trigger":"post_first_win"}),
            None,
            json!({"platform":"ios_guide","trigger":"post_first_win"}),
        ),
        (
            json!({"event":"pwa_installed","platform":"chromium","trigger":"post_first_win"}),
            None,
            json!({"platform":"chromium","trigger":"post_first_win"}),
        ),
        (
            json!({"event":"pwa_install_prompted","platform":"chromium","trigger":"post_first_win","isGuest":true}),
            None,
            json!({"platform":"chromium","trigger":"post_first_win","is_guest":true}),
        ),
        (
            json!({"event":"pwa_installed","platform":"other","trigger":"post_first_win","isGuest":false}),
            None,
            json!({"platform":"other","trigger":"post_first_win","is_guest":false}),
        ),
        (
            json!({"event":"pwa_installed","platform":"ios_guide","trigger":"post_first_win","isGuest":null}),
            None,
            json!({"platform":"ios_guide","trigger":"post_first_win"}),
        ),
        (
            json!({
                "event":"save_streak_prompted","status":"lost","trigger":"daily_finish",
                "gameSlug":"sudoku","gameId":"private-game","path":"/games/sudoku?email=private",
                "userId":"private-user","email":"player@example.invalid","isGuest":true,
                "params":{"email":"player@example.invalid"},
            }),
            None,
            json!({"outcome":"lost","trigger":"daily_finish"}),
        ),
        (
            json!({"event":"save_streak_clicked","status":"won","trigger":"daily_finish"}),
            None,
            json!({"outcome":"won","trigger":"daily_finish"}),
        ),
        (
            json!({"event":"push_opted_in","trigger":"settings","result":"denied","gameSlug":"sudoku","isGuest":true}),
            None,
            json!({"trigger":"settings","result":"denied"}),
        ),
    ];
    assert_eq!(
        post_event(&app, "https://foreign.example", "same-origin", &cases[0].0).await,
        StatusCode::FORBIDDEN,
    );
    assert_eq!(
        post_event(&app, &origin, "cross-site", &cases[0].0).await,
        StatusCode::FORBIDDEN,
    );
    for (input, _, _) in &cases {
        assert_eq!(
            post_event(&app, &origin, "same-origin", input).await,
            StatusCode::OK,
            "{input}"
        );
    }
    // Invalid browser events are quietly dropped, as before. The exact SQL
    // length below proves none of these requests made it through to storage.
    for input in [
        json!({"event":"signup"}),
        json!({"event":"purchase"}),
        json!({"event":"other-private-event"}),
        json!({"event":"game_start","gameSlug":"user-secret"}),
        json!({"event":"hint_used","gameSlug":"user-secret","mode":"daily","hintCount":1}),
        json!({"event":"game_abandon","gameSlug":"sudoku","mode":"daily","isGuest":false}),
        json!({"event":"share_clicked","gameSlug":"sudoku","action":"save_png"}),
        json!({"event":"paywall_hit","gameSlug":"sudoku","surface":"archive_lock","picksUsed":0,"currency":"BTC","isGuest":false}),
        json!({"event":"push_opted_in","trigger":"settings","result":"arbitrary-user-text"}),
        json!({"event":"save_streak_prompted","status":"player@example.invalid","trigger":"daily_finish"}),
        json!({"event":"save_streak_prompted","trigger":"daily_finish"}),
        json!({"event":"save_streak_clicked","status":"lost","trigger":"post_first_win"}),
        json!({"event":"save_streak_clicked","status":"won"}),
    ] {
        assert_eq!(
            post_event(&app, &origin, "same-origin", &input).await,
            StatusCode::OK,
            "{input}"
        );
    }
    // Connect rejects wrong JSON types instead of coercing guest status or enums.
    for input in [
        json!({"event":"pwa_install_prompted","platform":"chromium","trigger":"post_first_win","isGuest":"false"}),
        json!({"event":"pwa_installed","platform":"chromium","trigger":"post_first_win","isGuest":0}),
        json!({"event":"save_streak_prompted","status":false,"trigger":"daily_finish"}),
        json!({"event":"save_streak_clicked","status":"won","trigger":0}),
    ] {
        assert_eq!(
            post_event(&app, &origin, "same-origin", &input).await,
            StatusCode::BAD_REQUEST,
            "{input}"
        );
    }
    let rows: Vec<(Value,)> =
        sqlx::query_as("SELECT to_jsonb(funnel_events) - 'id' - 'occurred_at' FROM funnel_events")
            .fetch_all(&pool)
            .await
            .unwrap_or_else(|e| panic!("read funnel rows: {e}"));
    assert_eq!(rows.len(), cases.len());
    for (input, game_slug, params) in cases {
        let expected = json!({
            "event": input["event"], "game_slug": game_slug, "params": params,
            "path": null, "metric": null, "value": null, "rating": null,
        });
        assert!(
            rows.iter().any(|row| row.0 == expected),
            "missing {expected}: {rows:?}"
        );
    }

    // A legacy caller uses the original six wire fields, without any params.
    let legacy = json!({"event":"web_vitals","path":"/pricing?discard=yes","metric":"CLS","value":0,"rating":"good"});
    assert_eq!(
        post_event(&app, &origin, "same-origin", &legacy).await,
        StatusCode::OK
    );
    let (stored,): (Value,) = sqlx::query_as(
        "SELECT to_jsonb(funnel_events) - 'id' - 'occurred_at' FROM funnel_events WHERE event = 'web_vitals'",
    )
    .fetch_one(&pool)
    .await
    .unwrap_or_else(|e| panic!("read legacy event: {e}"));
    assert_eq!(
        stored,
        json!({
            "event":"web_vitals", "path":"/pricing", "game_slug":null, "metric":"CLS",
            "value":0, "rating":"good", "params":null,
        })
    );
}
