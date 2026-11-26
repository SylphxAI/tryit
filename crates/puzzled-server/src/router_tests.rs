//! Router health, readiness, and public route contracts.

use crate::test_support::{
    body_json, build_connect_request, build_connect_request_with_auth, connect_error_message,
    mint_test_token, mint_test_token_with_scope,
};
use crate::{router, AppState};
use axum::body::Body;
use axum::http::{Method, Request, StatusCode};
use tower::ServiceExt;

fn build_request(method: Method, uri: &str, body: Body) -> Request<Body> {
    let method_name = method.as_str().to_owned();
    match Request::builder().method(method).uri(uri).body(body) {
        Ok(request) => request,
        Err(error) => panic!("build request {method_name} {uri}: {error}"),
    }
}

#[tokio::test]
async fn healthz_returns_ok_json() {
    let app = router(AppState::new(None));
    let response = match app
        .oneshot(build_request(Method::GET, "/healthz", Body::empty()))
        .await
    {
        Ok(response) => response,
        Err(error) => panic!("healthz request: {error}"),
    };
    assert_eq!(response.status(), StatusCode::OK);
    let json = body_json(response).await;
    assert_eq!(json, serde_json::json!({"status": "ok"}));
}

#[tokio::test]
async fn observability_test_trigger_is_hidden_without_the_key() {
    let app = router(AppState::new(None));
    let response = match app
        .oneshot(build_request(
            Method::POST,
            "/observability/test",
            Body::from(r#"{"nonce":"x"}"#),
        ))
        .await
    {
        Ok(response) => response,
        Err(error) => panic!("observability test request: {error}"),
    };
    assert_eq!(response.status(), StatusCode::NOT_FOUND);
}

#[tokio::test]
async fn connect_health_returns_serving_ok() {
    let app = router(AppState::new(None));
    let response = match app
        .oneshot(build_connect_request(
            "/puzzled.v1.HealthService/Health",
            Body::from("{}"),
        ))
        .await
    {
        Ok(response) => response,
        Err(error) => panic!("connect health: {error}"),
    };
    assert_eq!(response.status(), StatusCode::OK);
    let json = body_json(response).await;
    // Proto3 JSON enum: name string (buffa) — numeric wire value is 1 (SERVING_STATUS_OK).
    assert!(
        json["status"] == "SERVING_STATUS_OK" || json["status"] == 1,
        "unexpected status: {}",
        json["status"]
    );
    assert_eq!(json["message"], "ok");
}

#[tokio::test]
async fn rest_api_v1_is_not_a_second_surface() {
    let app = router(AppState::new(None));
    let response = match app
        .oneshot(build_request(Method::GET, "/api/v1/puzzles", Body::empty()))
        .await
    {
        Ok(response) => response,
        Err(error) => panic!("rest /api/v1: {error}"),
    };
    assert_ne!(
        response.status(),
        StatusCode::OK,
        "hand-rolled REST /api/v1 must stay deleted"
    );
}

#[tokio::test]
async fn jobs_connect_is_mounted() {
    let app = router(AppState::new(None));
    let response = match app
        .oneshot(build_connect_request(
            "/puzzled.v1.JobsService/RunRetentionJob",
            Body::from(r#"{"name":"daily-reminder"}"#),
        ))
        .await
    {
        Ok(response) => response,
        Err(error) => panic!("connect JobsService: {error}"),
    };
    assert_ne!(
        response.status(),
        StatusCode::NOT_FOUND,
        "JobsService must be mounted on the Connect router"
    );
    assert!(
        response.status().is_client_error() || response.status().is_server_error(),
        "unauthenticated jobs must fail closed, got {}",
        response.status()
    );
}

#[tokio::test]
async fn connect_get_leaderboard_returns_retired_error() {
    let app = router(AppState::new(None));
    let response = match app
        .oneshot(build_connect_request(
            "/puzzled.v1.StatsService/GetLeaderboard",
            Body::from(r#"{"gameSlug":"sudoku","type":"LEADERBOARD_TYPE_SCORE","period":"LEADERBOARD_PERIOD_ALL","limit":10}"#),
        ))
        .await
    {
        Ok(response) => response,
        Err(error) => panic!("connect GetLeaderboard: {error}"),
    };
    assert_eq!(response.status(), StatusCode::NOT_IMPLEMENTED);
    let json = body_json(response).await;
    assert_eq!(json["code"], "unimplemented");
    assert_eq!(json["message"], "leaderboard_retired");
}

#[tokio::test]
async fn connect_get_streak_info_requires_identity() {
    let app = router(AppState::new(None));
    let response = match app
        .oneshot(build_connect_request(
            "/puzzled.v1.GamificationService/GetStreakInfo",
            Body::from("{}"),
        ))
        .await
    {
        Ok(response) => response,
        Err(error) => panic!("connect GetStreakInfo: {error}"),
    };
    assert_eq!(response.status(), StatusCode::UNAUTHORIZED);
}

#[tokio::test]
async fn connect_get_streak_info_fails_closed_without_store() {
    let app = router(AppState::new(None));
    let token = mint_test_token("f715210b-9df3-4945-b5bd-94fc4609bc30");
    let response = match app
        .oneshot(build_connect_request_with_auth(
            "/puzzled.v1.GamificationService/GetStreakInfo",
            Body::from("{}"),
            &token,
        ))
        .await
    {
        Ok(response) => response,
        Err(error) => panic!("connect GetStreakInfo store: {error}"),
    };
    assert_ne!(
        response.status(),
        StatusCode::OK,
        "missing store must not return a fabricated zero streak"
    );
    assert!(
        response.status().is_server_error(),
        "expected fail-closed server error, got {}",
        response.status()
    );
    let json = body_json(response).await;
    assert!(
        json.get("info").is_none(),
        "missing store must not include streak info: {json}"
    );
    let message = json.get("message").and_then(|v| v.as_str()).unwrap_or("");
    assert!(
        message.contains("streak_store_unavailable") || message.contains("unavailable"),
        "unexpected error payload: {json}"
    );
}

#[tokio::test]
async fn connect_get_streak_info_refuses_legacy_guest_header() {
    let app = router(AppState::new(None));
    let request = match Request::builder()
        .method(Method::POST)
        .uri("/puzzled.v1.GamificationService/GetStreakInfo")
        .header(axum::http::header::CONTENT_TYPE, "application/json")
        .header("x-puzzled-guest-id", "a1b2c3d4-e5f6-7890-abcd-ef1234567890")
        .body(Body::from("{}"))
    {
        Ok(request) => request,
        Err(error) => panic!("build GetStreakInfo: {error}"),
    };
    let response = match app.oneshot(request).await {
        Ok(response) => response,
        Err(error) => panic!("connect GetStreakInfo: {error}"),
    };
    assert_eq!(response.status(), StatusCode::UNAUTHORIZED);
}

#[tokio::test]
async fn readyz_fails_closed_without_database() {
    let app = router(AppState::new(None));
    let response = match app
        .oneshot(build_request(Method::GET, "/readyz", Body::empty()))
        .await
    {
        Ok(response) => response,
        Err(error) => panic!("readyz request: {error}"),
    };
    assert_eq!(response.status(), StatusCode::SERVICE_UNAVAILABLE);
    let json = body_json(response).await;
    assert_eq!(json, serde_json::json!({"status": "not_ready"}));
}

#[tokio::test]
async fn readyz_returns_ok_with_postgres() {
    let Some(db) = crate::test_support::fresh_database().await else {
        return;
    };
    let response = router(AppState::new(Some(db)))
        .oneshot(build_request(Method::GET, "/readyz", Body::empty()))
        .await
        .unwrap_or_else(|error| panic!("readyz request: {error}"));
    assert_eq!(response.status(), StatusCode::OK);
    assert_eq!(response.headers()["cache-control"], "no-store");
    assert_eq!(
        body_json(response).await,
        serde_json::json!({"status": "ok"})
    );
}

#[tokio::test]
async fn rest_api_v1_surface_is_gone() {
    let response = match router(AppState::new(None))
        .oneshot(build_request(Method::GET, "/api/v1", Body::empty()))
        .await
    {
        Ok(response) => response,
        Err(error) => panic!("GET /api/v1: {error}"),
    };
    assert_eq!(response.status(), StatusCode::NOT_FOUND);
    let response = match router(AppState::new(None))
        .oneshot(build_request(
            Method::POST,
            "/api/webhooks/platform-jobs",
            Body::empty(),
        ))
        .await
    {
        Ok(response) => response,
        Err(error) => panic!("POST platform-jobs webhook: {error}"),
    };
    assert_ne!(response.status(), StatusCode::OK);
}

#[tokio::test]
async fn admin_does_not_accept_legacy_platform_jwt_scopes() {
    let anonymous = match router(AppState::new(None))
        .oneshot(build_connect_request(
            "/puzzled.v1.AdminService/ListAnnouncements",
            Body::from("{}"),
        ))
        .await
    {
        Ok(response) => response,
        Err(error) => panic!("admin anonymous: {error}"),
    };
    assert_eq!(anonymous.status(), StatusCode::UNAUTHORIZED);

    let customer = mint_test_token("f715210b-9df3-4945-b5bd-94fc4609bc30");
    let customer = match router(AppState::new(None))
        .oneshot(build_connect_request_with_auth(
            "/puzzled.v1.AdminService/ListAnnouncements",
            Body::from("{}"),
            &customer,
        ))
        .await
    {
        Ok(response) => response,
        Err(error) => panic!("admin customer: {error}"),
    };
    assert_eq!(customer.status(), StatusCode::FORBIDDEN);
    let customer_json = body_json(customer).await;
    assert!(
        connect_error_message(&customer_json).contains("admin_scope_required"),
        "unexpected customer admin payload: {customer_json}"
    );

    let platform_ops = mint_test_token_with_scope(
        "f715210b-9df3-4945-b5bd-94fc4609bc30",
        Some("platform:admin"),
    );
    let platform_ops = match router(AppState::new(None))
        .oneshot(build_connect_request_with_auth(
            "/puzzled.v1.AdminService/ListAnnouncements",
            Body::from("{}"),
            &platform_ops,
        ))
        .await
    {
        Ok(response) => response,
        Err(error) => panic!("admin platform:admin: {error}"),
    };
    assert_eq!(platform_ops.status(), StatusCode::FORBIDDEN);
    let platform_json = body_json(platform_ops).await;
    assert!(
        connect_error_message(&platform_json).contains("admin_scope_required"),
        "platform:admin must not skip product admin: {platform_json}"
    );

    let product_admin =
        mint_test_token_with_scope("f715210b-9df3-4945-b5bd-94fc4609bc30", Some("admin"));
    let product_admin = match router(AppState::new(None))
        .oneshot(build_connect_request_with_auth(
            "/puzzled.v1.AdminService/ListAnnouncements",
            Body::from("{}"),
            &product_admin,
        ))
        .await
    {
        Ok(response) => response,
        Err(error) => panic!("admin product admin: {error}"),
    };
    assert_eq!(product_admin.status(), StatusCode::FORBIDDEN);
    let admin_json = body_json(product_admin).await;
    assert!(
        connect_error_message(&admin_json).contains("admin_scope_required"),
        "legacy admin scope must not grant access: {admin_json}"
    );
}

#[tokio::test]
#[allow(clippy::unwrap_used)]
async fn verification_server_timing_requires_an_exact_opt_in_and_is_not_cacheable() {
    for (path, flags, want) in [
        ("/puzzled.v1.HealthService/Health", vec![], false),
        ("/puzzled.v1.HealthService/Health", vec!["0"], false),
        ("/puzzled.v1.HealthService/Health", vec!["1", "1"], false),
        ("/healthz", vec!["1"], false),
        ("/puzzled.v1.HealthService/Health", vec!["1"], true),
    ] {
        let mut req = if path == "/healthz" {
            build_request(Method::GET, path, Body::empty())
        } else {
            build_connect_request(path, Body::from("{}"))
        };
        for flag in flags {
            req.headers_mut().append(
                "x-puzzled-verification",
                axum::http::HeaderValue::from_static(flag),
            );
        }
        let response = router(AppState::new(None)).oneshot(req).await.unwrap();
        assert_eq!(response.status(), StatusCode::OK);
        let timing = response.headers().get("server-timing");
        assert_eq!(timing.is_some(), want);
        if let Some(timing) = timing {
            let value = timing.to_str().unwrap();
            assert!(value.starts_with("handler;dur="));
            assert!(value.contains("round_trips;desc=\"0\""));
            assert_eq!(response.headers()["cache-control"], "private, no-store");
            assert_eq!(response.headers()["cdn-cache-control"], "no-store");
        }
    }
}
