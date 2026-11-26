use crate::test_support::token;
use crate::{router, AppState};
use axum::{
    body::{to_bytes, Body},
    http::{Request, StatusCode},
};
use chrono::Utc;
use puzzled_core::puzzle_play::daily_time::product_day_key_string;
use serde_json::Value;
use sqlx::PgPool;
use tower::ServiceExt;
use uuid::Uuid;

pub(super) async fn rpc(pool: Option<&PgPool>, viewer: Option<Uuid>, body: Value) -> Value {
    let mut request = Request::builder()
        .method("POST")
        .uri("/puzzled.v1.StatsService/GetTodayPercentile")
        .header("content-type", "application/json");
    if let Some(viewer) = viewer {
        request = request.header(
            "authorization",
            format!("Bearer {}", token(&viewer.to_string())),
        );
    }
    let response = router(AppState::new(pool.cloned()))
        .oneshot(request.body(Body::from(body.to_string())).unwrap())
        .await
        .unwrap();
    assert_eq!(response.status(), StatusCode::OK);
    assert_eq!(
        response.headers()["cache-control"],
        "private, no-store, max-age=0"
    );
    assert_eq!(response.headers()["cdn-cache-control"], "no-store");
    serde_json::from_slice(&to_bytes(response.into_body(), usize::MAX).await.unwrap()).unwrap()
}

pub(super) async fn seed(pool: &PgPool, slug: &str, me_at: i32) -> Uuid {
    let me = Uuid::now_v7();
    for i in 0..12_i32 {
        sqlx::query(
            "INSERT INTO game_sessions
            (user_id, game_slug, mode, status, score, attempts, time_spent_ms,
             hints_used, day_key, is_ritual, module_class)
            VALUES ($1,$2,'daily','won',$3,$4,$5,$6,$7,true,'puzzle_ritual')",
        )
        .bind(if i == me_at { me } else { Uuid::now_v7() })
        .bind(slug)
        .bind(if slug == "word-groups" {
            100 - (i % 4) * 25
        } else {
            i
        })
        .bind(i + 1)
        .bind((i + 1) * 1000)
        .bind(i64::from(i % 3))
        .bind(product_day_key_string(Utc::now()))
        .execute(pool)
        .await
        .unwrap();
    }
    me
}

pub(super) fn absent_percentile(v: &Value, dispatch: &str) {
    assert!(v.get("percentile").is_none_or(Value::is_null), "{v}");
    assert_eq!(v["dispatch"], dispatch, "{v}");
}
