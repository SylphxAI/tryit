//! Sylphx Auth end-user sessions through the real router, against a fake Auth.

use std::sync::atomic::{AtomicUsize, Ordering};
use std::sync::Arc;

use axum::body::Body;
use axum::extract::Query;
use axum::http::{HeaderMap, Method, Request, StatusCode};
use axum::routing::get;
use axum::{Json, Router};
use serde_json::{json, Value};
use tower::ServiceExt;

use crate::capabilities::identity_access::adapters::auth_session::{
    encode_identity, AuthSessions, VERIFIED_IDENTITY_HEADER,
};
use crate::capabilities::identity_access::adapters::platform_jwt::VerifiedIdentity;
use crate::{router, AppState};

const GOOD: &str = "identity_org_session_good";
/// A valid session of another tenant's Auth instance.
const FOREIGN: &str = "identity_org_session_foreign";
const KEY: &str = "sk_test_caller";
const ORG: &str = "organization-0199aa10-7b2c-7d3e-8f00-00000000c0de";

async fn spawn_fake_auth(calls: Arc<AtomicUsize>) -> String {
    let app = Router::new().route(
        "/v1/sessions/current",
        get(move |headers: HeaderMap| {
            let calls = calls.clone();
            async move {
                calls.fetch_add(1, Ordering::SeqCst);
                let bearer = headers
                    .get("authorization")
                    .and_then(|v| v.to_str().ok())
                    .unwrap_or("");
                let agent = headers
                    .get("user-agent")
                    .and_then(|v| v.to_str().ok())
                    .unwrap_or("");
                if headers
                    .get("x-sylphx-caller-key")
                    .and_then(|v| v.to_str().ok())
                    != Some(KEY)
                {
                    return (
                        StatusCode::UNAUTHORIZED,
                        Json(json!({"error": "caller key required"})),
                    );
                }
                let project = if bearer == format!("Bearer {GOOD}") {
                    Some(ORG)
                } else if bearer == format!("Bearer {FOREIGN}") {
                    Some("organization-0199aa10-7b2c-7d3e-8f00-00000000bad0")
                } else {
                    None
                };
                if let (Some(project), "Browser/1.0") = (project, agent) {
                    (
                        StatusCode::OK,
                        Json(json!({"session": {"principal": {
                        "principal_id": "principal-0199aa10-7b2c-7d3e-8f00-1234567890ab",
                        "project_id": project,
                        "display_name": "Ada", "primary_email": "ada@example.com",
                        "state": "active"}}})),
                    )
                } else {
                    (
                        StatusCode::UNAUTHORIZED,
                        Json(json!({"error": "unauthenticated"})),
                    )
                }
            }
        }),
    );
    let listener = tokio::net::TcpListener::bind("127.0.0.1:0").await.unwrap();
    let addr = listener.local_addr().unwrap();
    tokio::spawn(async move { axum::serve(listener, app).await.unwrap() });
    format!("http://{addr}")
}

async fn subscription(app: &Router, headers: &[(&str, String)]) -> (StatusCode, Value) {
    billing_rpc(app, "/puzzled.v1.BillingService/GetSubscription", headers).await
}

async fn billing_rpc(app: &Router, path: &str, headers: &[(&str, String)]) -> (StatusCode, Value) {
    let mut request = Request::builder()
        .method(Method::POST)
        .uri(path)
        .header("content-type", "application/json");
    if !headers.iter().any(|(name, _)| *name == "user-agent") {
        request = request.header("user-agent", "Browser/1.0");
    }
    for (name, value) in headers {
        request = request.header(*name, value);
    }
    let response = app
        .clone()
        .oneshot(request.body(Body::from("{}")).unwrap())
        .await
        .unwrap();
    let status = response.status();
    if path == crate::proto::puzzled::v1::BILLING_SERVICE_GET_PASS_ELIGIBILITY_SPEC.procedure {
        assert!(!response.headers().contains_key("set-cookie"));
        if status.is_success() {
            assert_eq!(response.headers()["cache-control"], "private, no-store");
        }
    }
    let bytes = axum::body::to_bytes(response.into_body(), usize::MAX)
        .await
        .unwrap();
    (
        status,
        serde_json::from_slice(&bytes).unwrap_or(Value::Null),
    )
}

#[tokio::test]
async fn auth_sessions_sign_players_in_and_forged_headers_do_not() {
    let calls = Arc::new(AtomicUsize::new(0));
    let base = spawn_fake_auth(calls.clone()).await;
    let app = router(AppState::new(None).with_auth(AuthSessions::new(
        base.clone(),
        ORG.into(),
        KEY.into(),
    )));

    // The web's session cookie is verified with Auth.
    let cookie = ("cookie", format!("x=1; puzzled_session={GOOD}"));
    let (status, body) = subscription(&app, std::slice::from_ref(&cookie)).await;
    assert_eq!(status, StatusCode::OK, "{body}");
    // A bearer works too, and the answer is cached (one Auth call so far).
    let (status, _) = subscription(&app, &[("authorization", format!("Bearer {GOOD}"))]).await;
    assert_eq!(status, StatusCode::OK);
    assert_eq!(
        calls.load(Ordering::SeqCst),
        1,
        "second check is served from cache"
    );

    // A session Auth refuses is not signed in.
    let bad = (
        "cookie",
        "puzzled_session=identity_org_session_revoked".to_string(),
    );
    let (status, _) = subscription(&app, &[bad]).await;
    assert_eq!(status, StatusCode::UNAUTHORIZED);

    // The same session from another User-Agent is refused (Auth binds it).
    let (status, _) = subscription(
        &app,
        &[
            ("authorization", format!("Bearer {GOOD}")),
            ("user-agent", "Other/2.0".to_string()),
        ],
    )
    .await;
    assert_eq!(status, StatusCode::UNAUTHORIZED);

    // A live session of another tenant's Auth instance is not signed in.
    let (status, _) = subscription(&app, &[("authorization", format!("Bearer {FOREIGN}"))]).await;
    assert_eq!(status, StatusCode::UNAUTHORIZED);

    // Without our own instance id configured, no session is accepted.
    let unset = router(AppState::new(None).with_auth(AuthSessions::new(
        base.clone(),
        String::new(),
        KEY.into(),
    )));
    let (status, _) = subscription(&unset, &[("authorization", format!("Bearer {GOOD}"))]).await;
    assert_eq!(status, StatusCode::UNAUTHORIZED);

    // Without the caller key, Auth is never called and no session is accepted.
    let calls_before = calls.load(Ordering::SeqCst);
    let keyless =
        router(AppState::new(None).with_auth(AuthSessions::new(base, ORG.into(), String::new())));
    let (status, _) = subscription(&keyless, &[("authorization", format!("Bearer {GOOD}"))]).await;
    assert_eq!(status, StatusCode::UNAUTHORIZED);
    assert_eq!(calls.load(Ordering::SeqCst), calls_before);

    // A client cannot set the internal header itself.
    let forged = encode_identity(&VerifiedIdentity {
        user_id: "0199aa10-7b2c-7d3e-8f00-1234567890ab".into(),
        display_name: None,
        email: None,
        actor: None,
    })
    .unwrap();
    let (status, _) = subscription(
        &app,
        &[(
            VERIFIED_IDENTITY_HEADER,
            forged.to_str().unwrap().to_string(),
        )],
    )
    .await;
    assert_eq!(status, StatusCode::UNAUTHORIZED);
}

/// The Auth subject to player map against a real database: both subject forms
/// reach the same player, the new form is never decoded, and the id map export
/// links a player whose subject changed while they were away.
#[tokio::test]
async fn both_auth_subject_forms_reach_the_same_player() {
    use crate::capabilities::identity_access::adapters::auth_subjects::{
        player_for, LINK_FROM_ID_MAP, SPLIT_PLAYERS_AFTER_LINK,
    };
    let Some(pool) = crate::test_support::fresh_database().await else {
        return;
    };
    const OLD: &str = "principal-0199aa10-7b2c-7d3e-8f00-1234567890ab";
    const NEW: &str = "usr_01kmp4wyhhfgxsyrjvh8e0tkkf";
    let existing = uuid::Uuid::parse_str("0199aa10-7b2c-7d3e-8f00-1234567890ab").unwrap();

    // Today's form keeps the player id Puzzled always derived, now as a row.
    assert_eq!(player_for(&pool, OLD, None).await.unwrap(), existing);
    assert_eq!(player_for(&pool, OLD, None).await.unwrap(), existing);

    // After Auth's cut the new form, with the legacy subject, is the same player.
    assert_eq!(player_for(&pool, NEW, Some(OLD)).await.unwrap(), existing);
    // And stays so without it.
    assert_eq!(player_for(&pool, NEW, None).await.unwrap(), existing);

    // A new person gets a fresh UUIDv7, stable across sign-ins.
    let fresh = player_for(&pool, "usr_01kmp4wyhhfgxsyrjvh8e0tkkg", None)
        .await
        .unwrap();
    assert_eq!(fresh.get_version_num(), 7);
    assert_eq!(
        player_for(&pool, "usr_01kmp4wyhhfgxsyrjvh8e0tkkg", None)
            .await
            .unwrap(),
        fresh
    );

    // A player away through the cut: linked from the id map export. One who
    // was first seen in the new form without the legacy subject is listed.
    let away_old = "principal-0199aa10-7b2c-7d3e-8f00-00000000000a";
    let away_new = "usr_01kmp4wyhhfgxsyrjvh8e0t00a";
    let split_old = "principal-0199aa10-7b2c-7d3e-8f00-00000000000b";
    let split_new = "usr_01kmp4wyhhfgxsyrjvh8e0t00b";
    let split_player = player_for(&pool, split_new, None).await.unwrap();
    let mut tx = pool.begin().await.unwrap();
    sqlx::query("CREATE TEMP TABLE id_map_import (old_text text, new_text text) ON COMMIT DROP")
        .execute(&mut *tx)
        .await
        .unwrap();
    for (old, new) in [(OLD, NEW), (away_old, away_new), (split_old, split_new)] {
        sqlx::query("INSERT INTO id_map_import VALUES ($1, $2)")
            .bind(old)
            .bind(new)
            .execute(&mut *tx)
            .await
            .unwrap();
    }
    sqlx::query(LINK_FROM_ID_MAP)
        .execute(&mut *tx)
        .await
        .unwrap();
    let split: Vec<(String, String)> = sqlx::query_as(sqlx::AssertSqlSafe(format!(
        "SELECT old_text, new_text FROM ({SPLIT_PLAYERS_AFTER_LINK}) q"
    )))
    .fetch_all(&mut *tx)
    .await
    .unwrap();
    tx.commit().await.unwrap();
    assert_eq!(split, [(split_old.to_string(), split_new.to_string())]);
    assert_eq!(
        player_for(&pool, away_new, None).await.unwrap(),
        uuid::Uuid::parse_str("0199aa10-7b2c-7d3e-8f00-00000000000a").unwrap()
    );
    assert_eq!(
        player_for(&pool, split_new, None).await.unwrap(),
        split_player
    );
}

const ADMIN_ORG: &str = "cor_ops_fixture";
const OTHER_ORG: &str = "cor_player_workspace_fixture";
const ADMIN_RPC: &str = "/puzzled.v1.AdminService/GetSettings";
const FREEZE_RPC: &str = "/puzzled.v1.GamificationService/AddStreakFreezes";

async fn spawn_membership_auth(membership: Arc<std::sync::Mutex<Option<Value>>>) -> String {
    let app = Router::new().route(
        "/v1/sessions/current",
        get(
            move |headers: HeaderMap,
                  Query(query): Query<std::collections::HashMap<String, String>>| {
                let membership = membership.clone();
                async move {
                    if headers
                        .get("x-sylphx-caller-key")
                        .and_then(|v| v.to_str().ok())
                        != Some(KEY)
                        || headers.get("user-agent").and_then(|v| v.to_str().ok())
                            != Some("Browser/1.0")
                    {
                        return (StatusCode::UNAUTHORIZED, Json(Value::Null));
                    }
                    let token = headers
                        .get("authorization")
                        .and_then(|v| v.to_str().ok())
                        .and_then(|v| v.strip_prefix("Bearer "));
                    let project = match token {
                        Some(GOOD | DELEGATED | FRESH_DELEGATION) => ORG,
                        Some(FOREIGN) => "organization-0199aa10-7b2c-7d3e-8f00-00000000bad0",
                        _ => return (StatusCode::UNAUTHORIZED, Json(Value::Null)),
                    };
                    let mut body = json!({"session": { "principal": {
                        "principal_id": "principal-0199aa10-7b2c-7d3e-8f00-1234567890ab",
                        "project_id": project,
                        "state": "active",
                    }}});
                    let fresh = !query.is_empty();
                    if token == Some(DELEGATED) || (token == Some(FRESH_DELEGATION) && fresh) {
                        body["session"]["act"] = Value::Null;
                    }
                    if fresh {
                        assert_eq!(query.len(), 1);
                        assert_eq!(
                            query.get("customer_organization").map(String::as_str),
                            Some(ADMIN_ORG)
                        );
                        let membership = membership.lock().unwrap().clone();
                        let Some(membership) = membership else {
                            return (StatusCode::FORBIDDEN, Json(json!({"code": "NOT_A_MEMBER"})));
                        };
                        body["membership"] = membership;
                    }
                    (StatusCode::OK, Json(body))
                }
            },
        ),
    );
    let listener = tokio::net::TcpListener::bind("127.0.0.1:0").await.unwrap();
    let addr = listener.local_addr().unwrap();
    tokio::spawn(async move { axum::serve(listener, app).await.unwrap() });
    format!("http://{addr}")
}

const DELEGATED: &str = "identity_org_session_delegated";
const FRESH_DELEGATION: &str = "identity_org_session_fresh_delegation";

async fn privileged_rpc(app: &Router, path: &str, token: &str) -> (StatusCode, Value) {
    let response = app
        .clone()
        .oneshot(
            Request::builder()
                .method(Method::POST)
                .uri(path)
                .header("content-type", "application/json")
                .header("user-agent", "Browser/1.0")
                // Match the browser's session transport.
                .header("cookie", format!("puzzled_session={token}"))
                .body(Body::from("{}"))
                .unwrap(),
        )
        .await
        .unwrap();
    let status = response.status();
    let bytes = axum::body::to_bytes(response.into_body(), usize::MAX)
        .await
        .unwrap();
    (status, serde_json::from_slice(&bytes).unwrap())
}

#[tokio::test]
async fn admin_rpc_requires_a_live_admin_role_on_the_configured_auth_customer_organization() {
    let admin = json!({"customer_organization": ADMIN_ORG, "roles": ["member", "admin"]});
    let membership = Arc::new(std::sync::Mutex::new(Some(admin.clone())));
    let base = spawn_membership_auth(membership.clone()).await;
    let auth = AuthSessions::new(base, ORG.into(), KEY.into());
    let unbound = router(AppState::new(None).with_auth(auth.clone()));
    assert_eq!(
        privileged_rpc(&unbound, ADMIN_RPC, GOOD).await.0,
        StatusCode::FORBIDDEN
    );
    assert_eq!(
        subscription(&unbound, &[("cookie", format!("puzzled_session={GOOD}"))])
            .await
            .0,
        StatusCode::OK
    );

    let app =
        router(AppState::new(None).with_auth(auth.with_admin_customer_organization(ADMIN_ORG)));
    // A verified role reaches the store. No store is configured in this test.
    let (status, body) = privileged_rpc(&app, ADMIN_RPC, GOOD).await;
    assert_eq!(status, StatusCode::SERVICE_UNAVAILABLE);
    assert_eq!(body["message"], "database_unavailable");

    // Both the cached identity and the fresh membership response are checked for delegation.
    for token in [DELEGATED, FRESH_DELEGATION] {
        let (status, body) = privileged_rpc(&app, ADMIN_RPC, token).await;
        assert_eq!(status, StatusCode::FORBIDDEN, "{token}");
        assert_eq!(body["message"], "admin_scope_required");
    }
    assert_eq!(
        privileged_rpc(&app, ADMIN_RPC, FOREIGN).await.0,
        StatusCode::UNAUTHORIZED
    );

    // Same token and router: revoking the role takes effect even though the
    // normal sign-in identity is still cached.
    for (case, result) in [
        (
            "ordinary member",
            Some(json!({"customer_organization": ADMIN_ORG, "roles": ["member"]})),
        ),
        ("not a member", None),
        (
            "other workspace",
            Some(json!({"customer_organization": OTHER_ORG, "roles": ["admin"]})),
        ),
        ("missing organization", Some(json!({"roles": ["admin"]}))),
        (
            "noncanonical role",
            Some(
                json!({"customer_organization": ADMIN_ORG, "roles": ["owner", "Admin", "platform:admin"]}),
            ),
        ),
        (
            "malformed roles",
            Some(json!({"customer_organization": ADMIN_ORG, "roles": ["admin", true]})),
        ),
    ] {
        *membership.lock().unwrap() = result;
        let (status, body) = privileged_rpc(&app, ADMIN_RPC, GOOD).await;
        assert_eq!(status, StatusCode::FORBIDDEN, "{case}");
        assert_eq!(body["message"], "admin_scope_required", "{case}");
    }
    // A privileged method outside the AdminService must use the same gate.
    assert_eq!(
        privileged_rpc(&app, FREEZE_RPC, GOOD).await.0,
        StatusCode::FORBIDDEN
    );
}

#[tokio::test]
async fn pass_eligibility_through_router_proves_free_without_writes() {
    use crate::capabilities::money::Money;
    use crate::proto::puzzled::v1::BILLING_SERVICE_GET_PASS_ELIGIBILITY_SPEC;
    use axum::routing::post;
    use sqlx::postgres::PgPoolOptions;

    const PLAYER: &str = "0199aa10-7b2c-7d3e-8f00-1234567890ab";
    let Some(writer) = crate::test_support::fresh_database().await else {
        return;
    };
    let read_only = (*writer.connect_options())
        .clone()
        .options([("default_transaction_read_only", "on")]);
    let reader = PgPoolOptions::new().connect_with(read_only).await.unwrap();
    let base = spawn_fake_auth(Arc::default()).await;
    let seed = |sql: &'static str| sqlx::raw_sql(sql).execute(&writer);
    // Update the fixture between reads to disprove reuse of cached denials.
    let mode = Arc::new(AtomicUsize::new(0));
    let seen = Arc::new(AtomicUsize::new(0));
    let catalog_seen = seen.clone();
    let money_router = Router::new()
        .route(
            "/v1/orgs/o/projects/p/envs/e/price_catalogs/default",
            get(move || async move {
                catalog_seen.fetch_add(1, Ordering::SeqCst);
                Json(
                    json!({"spec":{"products":[{"key":"pass","features":{"plus":"true"},
                    "licence":{"term":{"unit":"days","count":3}},
                    "prices":[{"key":"once","unit_amounts":{"USD":"299"}}]}]}}),
                )
            }),
        )
        .route(
            "/v1/orgs/o/projects/p/envs/e/entitlement_grants:check",
            post({
                let (mode, seen) = (mode.clone(), seen.clone());
                move |Json(body): Json<Value>| {
                    let (mode, seen) = (mode.clone(), seen.clone());
                    async move {
                        seen.fetch_add(1, Ordering::SeqCst);
                        let feature = body["feature"].as_str();
                        let subject = body["subject"]["end_user"].as_str();
                        match (mode.load(Ordering::SeqCst), feature, subject) {
                            (1, Some("plus"), Some("linked-player")) | (3, Some("family"), _) => {
                                (StatusCode::OK, Json(json!({"entitled":true})))
                            }
                            (2, Some("plus"), Some("linked-player"))
                            | (4, Some("family"), _)
                            | (5, Some("plus"), Some(PLAYER)) => {
                                (StatusCode::SERVICE_UNAVAILABLE, Json(json!({})))
                            }
                            _ => (StatusCode::OK, Json(json!({}))),
                        }
                    }
                }
            }),
        )
        .fallback(|| async { panic!("unexpected Money route on presentation read") });
    let listener = tokio::net::TcpListener::bind("127.0.0.1:0").await.unwrap();
    let origin = format!(
        "http://{}/v1/orgs/o/projects/p/envs/e",
        listener.local_addr().unwrap()
    );
    let money = Money::new(&origin, KEY, "https://puzzled.test");
    tokio::spawn(async move { axum::serve(listener, money_router).await.unwrap() });
    let auth = AuthSessions::new(base, ORG.into(), KEY.into()).with_pool(Some(reader.clone()));
    let app = router(
        AppState::new(Some(reader.clone()))
            .with_auth(auth)
            .with_money(Some(money.clone())),
    );
    let read = |cookie| async {
        let (status, body) = billing_rpc(
            &app,
            BILLING_SERVICE_GET_PASS_ELIGIBILITY_SPEC.procedure,
            &[("cookie", cookie)],
        )
        .await;
        (status, body["knownFree"] == true)
    };
    let cookie = || format!("puzzled_session={GOOD}");
    for candidate in [
        "__Host-puzzled_guest=fixture".into(),
        format!("puzzled_session={FOREIGN}"),
        cookie(),
    ] {
        assert_eq!(read(candidate).await, (StatusCode::UNAUTHORIZED, false));
    }
    assert_eq!(seen.load(Ordering::SeqCst), 0);

    sqlx::query("INSERT INTO auth_subjects (subject,user_id) VALUES ('principal-' || $1,$1::uuid),('linked-player',$1::uuid)")
        .bind(PLAYER).execute(&writer).await.unwrap();
    assert_eq!(
        read(format!("{}; puzzled_checkout_claim=", cookie())).await,
        (StatusCode::OK, false)
    );
    assert_eq!(seen.load(Ordering::SeqCst), 0);
    assert_eq!(read(cookie()).await, (StatusCode::OK, true));
    assert!(!money.try_check(PLAYER, "plus").await.unwrap().entitled);
    for (grant_mode, status) in [
        (1, StatusCode::OK),
        (2, StatusCode::SERVICE_UNAVAILABLE),
        (5, StatusCode::SERVICE_UNAVAILABLE),
    ] {
        mode.store(grant_mode, Ordering::SeqCst);
        assert_eq!(read(cookie()).await, (status, false));
    }
    let count = seen.load(Ordering::SeqCst);
    assert!(!money.try_check(PLAYER, "plus").await.unwrap().entitled);
    assert_eq!(
        seen.load(Ordering::SeqCst),
        count,
        "presentation must not refresh grants"
    );
    sqlx::query("INSERT INTO family_members (member_user_id,owner_user_id) VALUES ($1::uuid,gen_random_uuid())")
        .bind(PLAYER).execute(&writer).await.unwrap();
    for (grant_mode, status) in [(3, StatusCode::OK), (4, StatusCode::SERVICE_UNAVAILABLE)] {
        mode.store(grant_mode, Ordering::SeqCst);
        assert_eq!(read(cookie()).await, (status, false));
    }
    mode.store(0, Ordering::SeqCst);
    sqlx::query("INSERT INTO game_sessions (user_id,game_slug,day_key,is_ritual,status) SELECT $1::uuid,'sudoku',d,true,'won' FROM unnest(ARRAY['2026-11-24','2026-11-25','2026-11-26']) AS d")
        .bind(PLAYER).execute(&writer).await.unwrap();
    assert_eq!(
        crate::capabilities::billing::service::known_free(&reader, &money, PLAYER, true).await,
        Ok(false)
    );
    assert_eq!(sqlx::query_as::<_, (i64,i64,i64,i64)>(
        "SELECT (SELECT count(*) FROM auth_subjects), (SELECT count(*) FROM plus_trials), (SELECT count(*) FROM tryit_conversions), (SELECT count(*) FROM metric_audiences)"
    ).fetch_one(&writer).await.unwrap(), (2, 0, 0, 0));
    seed("ALTER TABLE family_members RENAME TO unavailable_family")
        .await
        .unwrap();
    assert_eq!(
        read(cookie()).await,
        (StatusCode::SERVICE_UNAVAILABLE, false)
    );
    seed("ALTER TABLE plus_trials RENAME TO unavailable_trials")
        .await
        .unwrap();
    assert!(
        crate::capabilities::billing::service::known_free(&reader, &money, PLAYER, true)
            .await
            .unwrap_err()
            .contains("trial read failed")
    );
}
