//! Shared Auth, HTTP, PostgreSQL and operator-command fixtures.

use std::sync::{Arc, Mutex};

use axum::body::{to_bytes, Body};
use axum::http::{Method, Request, StatusCode};
use axum::{Json, Router};
use serde_json::{json, Value};
use sqlx::PgPool;
use tower::ServiceExt;
use uuid::Uuid;

use crate::capabilities::identity_access::adapters::auth_erasure::AuthErasure;
use crate::{router, AppState};

pub(super) const DELETE_PATH: &str = "/puzzled.v1.PreferencesService/DeleteAccountData";
const ORGANIZATION_ID: &str = "org_test";
pub(super) const SECRET_KEY: &str = "sk_test_erasure";

/// A stub Auth that records every privacy request it receives.
#[derive(Clone)]
pub(super) struct StubAuth {
    pub(super) seen: Arc<Mutex<Vec<Value>>>,
    status: u16,
    answer: Value,
    /// Answers for the first requests, in order (status, body, delay before
    /// answering); then `status` and `answer`.
    script: Arc<Mutex<std::collections::VecDeque<(u16, Value, u64)>>>,
}

impl StubAuth {
    pub(super) fn accepting() -> Self {
        Self {
            seen: Arc::default(),
            status: 202,
            answer: json!({"privacy_request": {"request_id": "privacy-request-1",
                                                "state": "accepted"}}),
            script: Arc::default(),
        }
    }

    pub(super) fn answering(status: u16, answer: Value) -> Self {
        Self {
            seen: Arc::default(),
            status,
            answer,
            script: Arc::default(),
        }
    }

    /// Answer the first requests from `script` (status, body, delay in ms).
    pub(super) fn scripted(self, script: Vec<(u16, Value, u64)>) -> Self {
        *self.script.lock().unwrap() = script.into();
        self
    }

    /// The subjects Auth was asked to delete, in request order.
    pub(super) fn subjects(&self) -> Vec<String> {
        self.seen
            .lock()
            .unwrap()
            .iter()
            .filter_map(|request| request["body"]["principal_id"].as_str().map(str::to_string))
            .collect()
    }

    /// The secret key each request carried.
    pub(super) fn authorizations(&self) -> Vec<String> {
        self.seen
            .lock()
            .unwrap()
            .iter()
            .filter_map(|request| request["authorization"].as_str().map(str::to_string))
            .collect()
    }
}

pub(super) async fn spawn_auth(stub: StubAuth) -> String {
    let app = Router::new().route(
        "/v1/privacy-requests",
        axum::routing::post(move |headers: axum::http::HeaderMap, body: String| {
            let stub = stub.clone();
            async move {
                stub.seen.lock().unwrap().push(json!({
                    "authorization": headers
                        .get(axum::http::header::AUTHORIZATION)
                        .and_then(|v| v.to_str().ok())
                        .unwrap_or_default(),
                    "body": serde_json::from_str::<Value>(&body).unwrap_or(Value::Null),
                }));
                let next = stub.script.lock().unwrap().pop_front();
                let (status, answer, delay) =
                    next.unwrap_or_else(|| (stub.status, stub.answer.clone(), 0));
                tokio::time::sleep(std::time::Duration::from_millis(delay)).await;
                (StatusCode::from_u16(status).unwrap(), Json(answer))
            }
        }),
    );
    let listener = tokio::net::TcpListener::bind("127.0.0.1:0").await.unwrap();
    let addr = listener.local_addr().unwrap();
    tokio::spawn(async move { axum::serve(listener, app).await.unwrap() });
    format!("http://{addr}")
}

/// The api as production serves it. `auth_url` None is Enable Auth unbound.
pub(super) fn app(pool: &PgPool, auth_url: Option<String>) -> Router {
    let state = AppState::new(Some(pool.clone())).with_erasure(auth_url.map(|url| {
        AuthErasure::new(url, ORGANIZATION_ID.into(), SECRET_KEY.into())
            .with_timeout(std::time::Duration::from_millis(300))
    }));
    router(state)
}

/// A player with notification preferences and (optionally) Auth subjects.
pub(super) async fn seed(pool: &PgPool, player: Uuid, subjects: &[&str]) {
    sqlx::query(r#"INSERT INTO "notification_preferences" ("user_id") VALUES ($1)"#)
        .bind(player)
        .execute(pool)
        .await
        .unwrap();
    for subject in subjects {
        sqlx::query(r#"INSERT INTO "auth_subjects" ("subject", "user_id") VALUES ($1, $2)"#)
            .bind(*subject)
            .bind(player)
            .execute(pool)
            .await
            .unwrap();
    }
}

pub(super) async fn preference_rows(pool: &PgPool, player: Uuid) -> i64 {
    sqlx::query_scalar(r#"SELECT count(*) FROM "notification_preferences" WHERE "user_id" = $1"#)
        .bind(player)
        .fetch_one(pool)
        .await
        .unwrap()
}

pub(super) async fn subject_rows(pool: &PgPool, player: Uuid) -> i64 {
    sqlx::query_scalar(r#"SELECT count(*) FROM "auth_subjects" WHERE "user_id" = $1"#)
        .bind(player)
        .fetch_one(pool)
        .await
        .unwrap()
}

pub(super) async fn delete_account(app: &Router, bearer: &str) -> (StatusCode, Value) {
    let response = app
        .clone()
        .oneshot(
            Request::builder()
                .method(Method::POST)
                .uri(DELETE_PATH)
                .header("content-type", "application/json")
                .header("authorization", format!("Bearer {bearer}"))
                .body(Body::from(json!({"confirm": "DELETE"}).to_string()))
                .unwrap(),
        )
        .await
        .unwrap();
    let status = response.status();
    let bytes = to_bytes(response.into_body(), usize::MAX).await.unwrap();
    (
        status,
        serde_json::from_slice(&bytes).unwrap_or(Value::Null),
    )
}

pub(super) fn message(body: &Value) -> String {
    body["message"].as_str().unwrap_or_default().to_string()
}

pub(super) async fn erase_player_command(pool: &PgPool, base: &str, args: &[&str]) -> (i32, Value) {
    use crate::capabilities::preferences::erase_player::{parse, run};
    let args: Vec<String> = args.iter().map(|s| (*s).to_string()).collect();
    let command = parse(&args).unwrap();
    let auth = AuthErasure::new(base.to_string(), ORGANIZATION_ID.into(), SECRET_KEY.into());
    let mut out = Vec::new();
    let code = run(&command, pool, None, Some(&auth), &mut out).await;
    let text = String::from_utf8(out).unwrap();
    for arg in &args {
        if arg.starts_with("usr_") || arg.starts_with("principal-") {
            assert!(
                !text.contains(arg.as_str()),
                "the report names a subject: {text}"
            );
        }
    }
    (code, serde_json::from_str(text.trim()).unwrap())
}

pub(super) fn accepted(id: &str) -> Value {
    json!({"privacy_request": {"request_id": id, "state": "accepted"}})
}
