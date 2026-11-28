//! Run the real Connect router against a contract-level Auth fixture.

use axum::body::Body;
use axum::extract::{Path, Query};
use axum::http::{HeaderMap, StatusCode};
use axum::response::Response;
use axum::routing::{get, post};
use axum::{Json, Router};
use serde_json::{json, Value};
use sqlx::PgPool;
use std::sync::atomic::{AtomicUsize, Ordering};
use std::sync::{Arc, Mutex};
use tower::ServiceExt;

use crate::capabilities::identity_access::adapters::auth_session::{
    encode_identity, AuthSessions, VERIFIED_IDENTITY_HEADER,
};
use crate::capabilities::metrics::policy::Day;
use crate::test_support::{
    body_json, build_connect_request, fresh_database, mint_test_token_with_scope,
};
use crate::{router, AppState, VerifiedIdentity};

const REPORT: &str = "/puzzled.v1.AdminService/GetMetricsReport";
const SETTINGS: &str = "/puzzled.v1.AdminService/GetSettings";
const ACCESS: &str = "tryit-analytics-access";
const PROJECT: &str = "organization-0199aa10-7b2c-7d3e-8f00-00000000c0de";
const PRINCIPAL: &str = "usr_01kmp4wyhhfgxsyrjvh8e0tkkf";
const ADMIN_ORG: &str = "cor_admin_fixture";
const READER_ORG: &str = "cor_metrics_fixture";
const READER: &str = "identity_org_session_reader";
const ADMIN: &str = "identity_org_session_admin";
const ADMIN_FAILURE: &str = "identity_org_session_admin_check_fails";
const FOREIGN: &str = "identity_org_session_other_instance";
const DELEGATED: &str = "identity_org_session_delegated";
const SCOPED_DELEGATION: &str = "identity_org_session_scoped_delegation";
const UA: &str = "Browser/metrics-fixture";
const KEY: &str = "pk_fixture";

fn allowed() -> Value {
    json!({
        "allowed": {"metrics:report:read": true},
        "subject": {
            "instance_id": "org_01k6n10yscfmz8y00000001g6y",
            "session_id": "ses_fixture",
            "principal_id": PRINCIPAL,
            "is_guest": false,
            "assurance_methods": ["passkey"],
            "delegated": false,
            "actor": null
        }
    })
}

#[derive(Clone)]
enum CheckReply {
    Json(Value),
    Http(StatusCode, String),
    Stall,
}

fn fixture_token(headers: &HeaderMap) -> Option<&str> {
    if headers.get("user-agent")?.to_str().ok()? != UA
        || headers.get("x-sylphx-caller-key")?.to_str().ok()? != KEY
    {
        return None;
    }
    headers
        .get("authorization")?
        .to_str()
        .ok()?
        .strip_prefix("Bearer ")
}

async fn fake_auth() -> (String, Arc<Mutex<CheckReply>>, Arc<AtomicUsize>) {
    let check = Arc::new(Mutex::new(CheckReply::Json(allowed())));
    let checks = Arc::new(AtomicUsize::new(0));
    let app = Router::new()
        .route(
            "/v1/sessions/current",
            get(
                |headers: HeaderMap,
                 Query(query): Query<std::collections::HashMap<String, String>>| async move {
                    let Some(
                        token @ (READER | ADMIN | DELEGATED | SCOPED_DELEGATION | ADMIN_FAILURE
                        | FOREIGN),
                    ) = fixture_token(&headers)
                    else {
                        return (StatusCode::UNAUTHORIZED, Json(Value::Null));
                    };
                    let mut body = json!({"session": {"principal": {
                        "principal_id": PRINCIPAL, "project_id": PROJECT, "state": "active"
                    }}});
                    if token == FOREIGN {
                        body["session"]["principal"]["project_id"] =
                            json!("organization-0199aa10-7b2c-7d3e-8f00-00000000bad0");
                    }
                    if !query.is_empty() {
                        assert_eq!(
                            query.get("customer_organization").map(String::as_str),
                            Some(ADMIN_ORG)
                        );
                        if token == ADMIN_FAILURE {
                            return (StatusCode::BAD_GATEWAY, Json(Value::Null));
                        }
                        if token == READER {
                            return (StatusCode::FORBIDDEN, Json(json!({"code":"NOT_A_MEMBER"})));
                        }
                        body["membership"] =
                            json!({"customer_organization": ADMIN_ORG, "roles": ["admin"]});
                    }
                    if token == DELEGATED || (token == SCOPED_DELEGATION && !query.is_empty()) {
                        body["session"]["actor"] = Value::Null;
                    }
                    (StatusCode::OK, Json(body))
                },
            ),
        )
        .route(
            "/v1/sessions/current/organizations/{door}",
            post({
                let check = check.clone();
                let checks = checks.clone();
                move |Path(door): Path<String>, headers: HeaderMap, Json(body): Json<Value>| {
                    let check = check.lock().unwrap().clone();
                    let checks = checks.clone();
                    async move {
                        let token = fixture_token(&headers);
                        assert!(matches!(
                            token,
                            Some(READER | ADMIN_FAILURE | SCOPED_DELEGATION)
                        ));
                        if token == Some(SCOPED_DELEGATION) {
                            return (StatusCode::FORBIDDEN, "not a direct reader".into());
                        }
                        checks.fetch_add(1, Ordering::Relaxed);
                        assert_eq!(body, json!({"permissions": ["metrics:report:read"]}));
                        if door != format!("{READER_ORG}:check") {
                            return (StatusCode::FORBIDDEN, "not a member".to_string());
                        }
                        match check {
                            CheckReply::Json(body) => (StatusCode::OK, body.to_string()),
                            CheckReply::Http(status, body) => (status, body),
                            CheckReply::Stall => std::future::pending().await,
                        }
                    }
                }
            }),
        );
    let listener = tokio::net::TcpListener::bind("127.0.0.1:0").await.unwrap();
    let addr = listener.local_addr().unwrap();
    tokio::spawn(async move { axum::serve(listener, app).await.unwrap() });
    (format!("http://{addr}"), check, checks)
}

fn app(base: &str, binding: Option<&str>, admin: bool, pool: Option<PgPool>) -> Router {
    let auth = AuthSessions::from_settings(|key| match key {
        "SYLPHX_AUTH_URL" => Some(base.into()),
        "SYLPHX_AUTH_ORGANIZATION_ID" => Some(PROJECT.into()),
        "SYLPHX_PUBLISHABLE_KEY" => Some(KEY.into()),
        "PUZZLED_ADMIN_CUSTOMER_ORGANIZATION_ID" => Some(if admin { ADMIN_ORG } else { "" }.into()),
        "PUZZLED_METRICS_CUSTOMER_ORGANIZATION_ID" => binding.map(str::to_string),
        _ => None,
    });
    router(AppState::new(pool.clone()).with_auth(auth.with_pool(pool)))
}

async fn rpc(app: &Router, path: &str, token: &str) -> Response {
    let body = if path.ends_with("/UpdateSettings") {
        json!({"key": "support_banner", "valueJson": "true"})
    } else {
        json!({})
    };
    let mut request = build_connect_request(path, Body::from(body.to_string()));
    let headers = request.headers_mut();
    headers.insert("user-agent", UA.parse().unwrap());
    headers.insert(
        "cookie",
        format!("puzzled_session={token}").parse().unwrap(),
    );
    // The incoming presentation header and a client copy of the internal
    // identity header confer no authority (nor can they select the org).
    headers.insert(ACCESS, "admin".parse().unwrap());
    headers.insert("x-customer-organization", READER_ORG.parse().unwrap());
    headers.insert(
        VERIFIED_IDENTITY_HEADER,
        encode_identity(&VerifiedIdentity {
            user_id: "0199aa10-7b2c-7d3e-8f00-1234567890ab".into(),
            display_name: None,
            email: None,
            actor: None,
        })
        .unwrap(),
    );
    app.clone().oneshot(request).await.unwrap()
}

async fn refused(response: Response, status: StatusCode, reason: &str) {
    assert_eq!(response.status(), status, "{reason}");
    assert!(!response.headers().contains_key(ACCESS), "{reason}");
    let body = body_json(response).await;
    let expected = if status == StatusCode::UNAUTHORIZED {
        "unauthenticated"
    } else {
        "permission_denied"
    };
    assert_eq!(body["code"], expected, "{reason}: {body}");
    assert_eq!(
        body["message"],
        if status == StatusCode::UNAUTHORIZED {
            "identity_required"
        } else {
            "metrics_scope_required"
        },
        "{reason}"
    );
}

#[tokio::test]
async fn metrics_requires_fresh_scoped_attestation_and_rejects_non_direct_sessions() {
    let (base, check, calls) = fake_auth().await;
    let router = app(&base, Some(READER_ORG), true, None);
    let report = |token| rpc(&router, REPORT, token);
    // Admission reaches the DB boundary even in the DB-free CI lane.
    let response = report(READER).await;
    assert_eq!(response.status(), StatusCode::SERVICE_UNAVAILABLE);
    assert!(!response.headers().contains_key(ACCESS));
    assert_eq!(body_json(response).await["message"], "database_unavailable");

    let settings = rpc(&router, SETTINGS, READER).await;
    assert_eq!(settings.status(), StatusCode::FORBIDDEN);
    assert!(!settings.headers().contains_key(ACCESS));
    assert_eq!(body_json(settings).await["message"], "admin_scope_required");

    for token in ["", "identity_org_session_expired"] {
        refused(report(token).await, StatusCode::UNAUTHORIZED, token).await;
    }
    for token in [DELEGATED, SCOPED_DELEGATION, FOREIGN] {
        refused(report(token).await, StatusCode::FORBIDDEN, token).await;
    }
    let jwt = mint_test_token_with_scope("0199aa10-7b2c-7d3e-8f00-1234567890ab", Some("admin"));
    let mut legacy = build_connect_request(REPORT, Body::from("{}"));
    legacy
        .headers_mut()
        .insert("authorization", format!("Bearer {jwt}").parse().unwrap());
    refused(
        router.clone().oneshot(legacy).await.unwrap(),
        StatusCode::UNAUTHORIZED,
        "legacy JWT",
    )
    .await;
    assert_eq!(calls.load(Ordering::Relaxed), 1);

    for binding in [None, Some("  "), Some("cor_wrong_fixture")] {
        let unbound = app(&base, binding, true, None);
        refused(
            rpc(&unbound, REPORT, READER).await,
            StatusCode::FORBIDDEN,
            "configured org only",
        )
        .await;
        assert_eq!(
            rpc(&unbound, REPORT, ADMIN).await.status(),
            StatusCode::SERVICE_UNAVAILABLE
        );
    }
    assert_eq!(
        calls.load(Ordering::Relaxed),
        2,
        "only a nonblank binding calls :check"
    );

    for (pointer, value) in [
        ("/allowed", json!(true)),
        ("/allowed", json!({"metrics:report:other": true})),
        ("/allowed/metrics:report:read", json!(false)),
        ("/allowed/metrics:report:read", json!("true")),
        ("/subject/principal_id", json!("usr_different")),
        (
            "/subject/instance_id",
            json!("0199aa10-7b2c-7d3e-8f00-00000000bad0"),
        ),
        ("/subject/is_guest", json!(true)),
        ("/subject/delegated", json!(true)),
        ("/subject/actor", json!({"sub": "usr_actor"})),
    ] {
        let mut body = allowed();
        *body.pointer_mut(pointer).unwrap() = value;
        *check.lock().unwrap() = CheckReply::Json(body);
        refused(report(READER).await, StatusCode::FORBIDDEN, pointer).await;
    }
    let mut missing_actor = allowed();
    missing_actor["subject"]
        .as_object_mut()
        .unwrap()
        .remove("actor");
    for (case, reply) in [
        ("missing actor", CheckReply::Json(missing_actor)),
        (
            "malformed body",
            CheckReply::Http(StatusCode::OK, "not JSON".into()),
        ),
        (
            "upstream 401",
            CheckReply::Http(StatusCode::UNAUTHORIZED, allowed().to_string()),
        ),
        (
            "upstream 5xx",
            CheckReply::Http(StatusCode::BAD_GATEWAY, allowed().to_string()),
        ),
        ("timeout", CheckReply::Stall),
    ] {
        *check.lock().unwrap() = reply;
        refused(report(READER).await, StatusCode::FORBIDDEN, case).await;
        if case == "upstream 5xx" {
            refused(
                report(ADMIN_FAILURE).await,
                StatusCode::FORBIDDEN,
                "both checks failed",
            )
            .await;
        }
    }
}

#[tokio::test]
async fn metrics_is_read_only_for_admins_and_readers_and_other_methods_stay_admin_only() {
    let Some(pool) = fresh_database().await else {
        return;
    };
    let (base, _, checks) = fake_auth().await;
    let bound = app(&base, Some(READER_ORG), true, Some(pool.clone()));
    let no_admin_binding = app(&base, Some(READER_ORG), false, Some(pool.clone()));
    let day = Day {
        day_key: "2026-11-26".into(),
        daily_puzzle_completers: 42,
        ..Day::default()
    };
    sqlx::query("INSERT INTO metric_days (id,day_key,report) VALUES ($1,$2,$3)")
        .bind(uuid::Uuid::now_v7())
        .bind(&day.day_key)
        .bind(serde_json::to_value(&day).unwrap())
        .execute(&pool)
        .await
        .unwrap();
    async fn counts(pool: &PgPool) -> (i64, i64, i64, i64, i64, i64, i64) {
        sqlx::query_as("SELECT (SELECT count(*) FROM auth_subjects), (SELECT count(*) FROM guest_credentials), (SELECT count(*) FROM game_sessions), (SELECT count(*) FROM metric_audiences), (SELECT count(*) FROM metric_days), (SELECT count(*) FROM metric_counters), (SELECT count(*) FROM metric_alert_outbox)")
            .fetch_one(pool).await.unwrap()
    }
    let before = counts(&pool).await;
    assert_eq!(before, (0, 0, 0, 0, 1, 0, 0));
    for (app, token, access) in [
        (&bound, READER, "reader"),
        (&bound, ADMIN, "admin"),
        (&bound, ADMIN_FAILURE, "reader"),
        (&no_admin_binding, READER, "reader"),
    ] {
        let response = rpc(app, REPORT, token).await;
        assert_eq!(response.status(), StatusCode::OK);
        assert_eq!(response.headers()[ACCESS], access);
        assert_eq!(response.headers()["cache-control"], "no-store");
        let body = body_json(response).await;
        assert_eq!(body["days"].as_array().unwrap().len(), 1);
        assert_eq!(body["days"][0]["dailyPuzzleCompleters"], 42);
        assert_eq!(counts(&pool).await, before, "{access}");
    }
    for path in [
        SETTINGS,
        "/puzzled.v1.AdminService/UpdateSettings",
        "/puzzled.v1.AdminService/ListAnnouncements",
        "/puzzled.v1.AdminService/ListDlq",
    ] {
        let response = rpc(&bound, path, READER).await;
        assert_eq!(response.status(), StatusCode::FORBIDDEN, "{path}");
        assert!(!response.headers().contains_key(ACCESS));
        assert_eq!(
            body_json(response).await["message"],
            "admin_scope_required",
            "{path}"
        );
    }
    assert_eq!(
        checks.load(Ordering::Relaxed),
        3,
        "no other method asks for metrics permission"
    );
    assert_eq!(rpc(&bound, SETTINGS, ADMIN).await.status(), StatusCode::OK);
    assert_eq!(
        counts(&pool).await.0,
        1,
        "other admin methods still use the existing player mapper"
    );
}
