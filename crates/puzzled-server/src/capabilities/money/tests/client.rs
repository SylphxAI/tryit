use std::sync::{Arc, Mutex};

use axum::routing::{get, post};
use axum::{Json, Router};
use serde_json::{json, Value};

use super::super::access::{family_active, is_premium};
use super::super::Money;
use super::{fake_money, USER};

#[tokio::test]
async fn the_environment_comes_from_the_keys_whoami_and_is_kept() {
    let hits = Arc::new(Mutex::new(0u32));
    let counter = hits.clone();
    let app = Router::new()
        .route(
            "/v1/whoami",
            get(move || {
                let counter = counter.clone();
                async move {
                    *counter.lock().unwrap() += 1;
                    Json(json!({"org": "acme", "project": "puz", "env": "env_x1"}))
                }
            }),
        )
        .route(
            "/v1/orgs/acme/projects/puz/envs/env_x1/entitlement_grants:check",
            post(|| async { Json(json!({"entitled": true})) }),
        );
    let listener = tokio::net::TcpListener::bind("127.0.0.1:0").await.unwrap();
    let addr = listener.local_addr().unwrap();
    tokio::spawn(async move { axum::serve(listener, app).await.unwrap() });
    let money = Money::discovering(&format!("http://{addr}"), "sk_app", "https://puzzled.test");
    assert!(is_premium(&money, USER).await);
    assert!(family_active(&money, USER).await);
    assert_eq!(*hits.lock().unwrap(), 1, "whoami is read once");
}

#[tokio::test]
async fn a_key_that_is_not_scoped_to_an_environment_grants_nothing() {
    let app = Router::new().route(
        "/v1/whoami",
        get(|| async { Json(json!({"org": "acme", "project": "", "env": ""})) }),
    );
    let listener = tokio::net::TcpListener::bind("127.0.0.1:0").await.unwrap();
    let addr = listener.local_addr().unwrap();
    tokio::spawn(async move { axum::serve(listener, app).await.unwrap() });
    let money = Money::discovering(&format!("http://{addr}"), "sk_org", "https://puzzled.test");
    assert!(money.warm().await.is_err());
    assert!(!is_premium(&money, USER).await);
}

#[test]
fn money_reads_only_its_own_key() {
    let only = |name: &'static str| move |asked: &str| (asked == name).then(|| "sk_x".to_string());
    // The general key never enables Money: it fails closed (no client).
    assert!(Money::from_lookup(only("SYLPHX_API_KEY")).is_none());
    assert!(Money::from_lookup(|_| None).is_none());
    assert!(Money::from_lookup(only("SYLPHX_MONEY_API_KEY")).is_some());
}

#[tokio::test]
async fn money_calls_carry_the_money_key() {
    async fn echo(headers: axum::http::HeaderMap) -> Json<Value> {
        let auth = headers.get("authorization").and_then(|v| v.to_str().ok());
        Json(json!({"entitled": auth == Some("Bearer sk_money"), "entitlement_grant": "g1"}))
    }
    let app = Router::new().route(
        "/v1/orgs/o/projects/p/envs/e/entitlement_grants:check",
        post(echo),
    );
    let listener = tokio::net::TcpListener::bind("127.0.0.1:0").await.unwrap();
    let addr = listener.local_addr().unwrap();
    tokio::spawn(async move { axum::serve(listener, app).await.unwrap() });
    let money = Money::new(
        &format!("http://{addr}/v1/orgs/o/projects/p/envs/e"),
        "sk_money",
        "https://puzzled.test",
    );
    assert!(is_premium(&money, USER).await);
}

#[test]
fn env_url_uses_full_resource_names_once() {
    let url = super::super::client::env_url(
        "https://m.example",
        &json!({"org":"orgs/o1","project":"orgs/o1/projects/p1","env":"orgs/o1/projects/p1/envs/e1"}),
    )
    .unwrap();
    assert_eq!(url, "https://m.example/v1/orgs/o1/projects/p1/envs/e1");
}

#[test]
fn env_url_keeps_the_bare_id_format() {
    let url = super::super::client::env_url(
        "https://m.example",
        &json!({"org":"o1","project":"p1","env":"e1"}),
    )
    .unwrap();
    assert_eq!(url, "https://m.example/v1/orgs/o1/projects/p1/envs/e1");
    assert!(super::super::client::env_url("https://m.example", &json!({"org":"o1"})).is_err());
}

#[tokio::test]
async fn a_refusal_logs_the_problem_reason_and_processor_code() {
    let (money, _) = fake_money(
        400,
        json!({
            "code": "INVALID_STATE",
            "status": 400,
            "detail": "Stripe refused the request (resource_missing). key sk_live_abc123",
            "details": [{"reason": "processor_refused", "processor_code": "resource_missing"}]
        }),
    )
    .await;
    let error = money.check_uncached(USER, "premium").await.unwrap_err();
    let text = error.to_string();
    assert!(text.contains("INVALID_STATE"), "{text}");
    assert!(text.contains("reason=processor_refused"), "{text}");
    assert!(text.contains("processor_code=resource_missing"), "{text}");
    assert!(text.contains("Stripe refused the request"), "{text}");
    assert!(!text.contains("sk_live_abc123"), "{text}");
}
