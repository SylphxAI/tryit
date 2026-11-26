use super::support::request;
use crate::test_support::{fresh_database, token};
use crate::{router, AppState};
use axum::body::{to_bytes, Body};
use axum::http::{Request, StatusCode};
use serde_json::{json, Value};
use tower::ServiceExt;
use uuid::Uuid;

#[tokio::test]
async fn production_origins_issue_and_reuse_host_only_cookies_without_database_effects() {
    let Some(pool) = fresh_database().await else {
        return;
    };
    let app = router(AppState::new(Some(pool.clone())));
    // Each host keeps its own existing cookie; this does not copy browser
    // credentials across domains or materialize guest records at bootstrap.
    for (origin, host) in [
        ("https://tryit.fun", "tryit.fun"),
        ("https://puzzled.gg", "puzzled.gg"),
    ] {
        let mut cookie: Option<String> = None;
        for issued in [true, false] {
            let mut req = Request::builder()
                .method("POST")
                .uri("/v1/guest/session")
                .header("content-type", "application/json")
                .header("origin", origin)
                .header("host", host)
                .header("sec-fetch-site", "same-origin");
            if let Some(cookie) = &cookie {
                req = req.header("cookie", cookie);
            }
            let response = app
                .clone()
                .oneshot(req.body(Body::from("{}")).unwrap())
                .await
                .unwrap();
            assert_eq!(response.status(), StatusCode::OK);
            assert!(response.headers().get("location").is_none());
            let returned = response.headers()["set-cookie"].to_str().unwrap();
            for attribute in [
                "__Host-puzzled_guest=",
                "Path=/",
                "HttpOnly",
                "Secure",
                "SameSite=Lax",
            ] {
                assert!(returned.contains(attribute));
            }
            assert!(!returned.contains("Domain="));
            let pair = returned.split(';').next().unwrap().to_string();
            if let Some(cookie) = &cookie {
                assert_eq!(&pair, cookie);
            }
            cookie = Some(pair);
            let bytes = to_bytes(response.into_body(), usize::MAX).await.unwrap();
            assert_eq!(
                serde_json::from_slice::<Value>(&bytes).unwrap(),
                json!({"issued": issued})
            );
        }
    }
    let count: i64 = sqlx::query_scalar("SELECT count(*) FROM guest_credentials")
        .fetch_one(&pool)
        .await
        .unwrap();
    assert_eq!(count, 0);
    pool.close().await;
}

#[tokio::test]
async fn issuance_rejects_origin_ambiguity_without_database_effects() {
    let Some(pool) = fresh_database().await else {
        return;
    };
    let app = router(AppState::new(Some(pool.clone())));
    for origin in [
        None,
        Some("null"),
        Some("https://elsewhere.invalid"),
        Some("https://puzzled.gg:8443"),
        Some("https://puzzled.gg, https://puzzled.gg"),
    ] {
        let mut req = Request::builder()
            .method("POST")
            .uri("/v1/guest/session")
            .header("content-type", "application/json")
            .header("host", "internal.invalid")
            .header("x-forwarded-host", "puzzled.gg");
        if let Some(origin) = origin {
            req = req.header("origin", origin);
        }
        let response = app
            .clone()
            .oneshot(req.body(Body::from("{}")).unwrap())
            .await
            .unwrap();
        assert_eq!(response.status(), StatusCode::FORBIDDEN);
        assert!(response.headers().get("set-cookie").is_none());
    }
    for (duplicate, mime, fetch_site) in [
        (true, "application/json", "same-origin"),
        (false, "text/plain", "same-origin"),
        (false, "application/json", "cross-site"),
    ] {
        let mut req = Request::builder()
            .method("POST")
            .uri("/v1/guest/session")
            .header("origin", "https://puzzled.gg")
            .header("content-type", mime)
            .header("sec-fetch-site", fetch_site);
        if duplicate {
            req = req.header("origin", "https://puzzled.gg");
        }
        let response = app
            .clone()
            .oneshot(req.body(Body::from("{}")).unwrap())
            .await
            .unwrap();
        assert_eq!(response.status(), StatusCode::FORBIDDEN);
        assert!(response.headers().get("set-cookie").is_none());
    }
    let count: i64 = sqlx::query_scalar("SELECT count(*) FROM guest_credentials")
        .fetch_one(&pool)
        .await
        .unwrap();
    assert_eq!(count, 0);
    pool.close().await;
}

#[tokio::test]
async fn issuance_header_refusal_precedes_unavailable_database_and_supplied_credentials() {
    let pool = sqlx::postgres::PgPoolOptions::new()
        .connect_lazy("postgres://test@127.0.0.1:59987/test")
        .unwrap();
    let app = router(AppState::new(Some(pool)));
    let req = Request::builder()
        .method("POST")
        .uri("/v1/guest/session")
        .header("content-type", "application/json")
        .header("origin", "https://foreign.invalid")
        .header(
            "authorization",
            format!("Bearer {}", token(&Uuid::now_v7().to_string())),
        )
        .header(
            "cookie",
            "__Host-puzzled_guest=AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA",
        )
        .body(Body::from("{}"))
        .unwrap();
    let response = app.oneshot(req).await.unwrap();
    assert_eq!(response.status(), StatusCode::FORBIDDEN);
    assert!(response.headers().get("set-cookie").is_none());
}

#[tokio::test]
async fn existing_cookie_parallel_bootstrap_keeps_one_registry_player() {
    use crate::capabilities::identity_access::adapters::guest_credentials;
    let Some(pool) = fresh_database().await else {
        return;
    };
    let cookie = guest_credentials::issue(&pool).await.unwrap();
    let pair = cookie.split(';').next().unwrap();
    let app = router(AppState::new(Some(pool.clone())));
    let (first, second) = tokio::join!(
        request(&app, "/v1/guest/session", Some(pair), None, None),
        request(&app, "/v1/guest/session", Some(pair), None, None),
    );
    assert_eq!(first.0, StatusCode::OK);
    assert_eq!(second.0, StatusCode::OK);
    assert!(first.2.unwrap().contains("Max-Age=34560000"));
    assert!(second.2.unwrap().contains("Max-Age=34560000"));
    let count: i64 = sqlx::query_scalar("SELECT count(*) FROM guest_credentials")
        .fetch_one(&pool)
        .await
        .unwrap();
    assert_eq!(count, 1);
    pool.close().await;
}

#[tokio::test]
async fn bootstrap_is_zero_database_and_unknown_read_does_not_allocate() {
    use crate::capabilities::identity_access::adapters::guest_credentials;
    let app = router(AppState::new(None));
    let (status, body, cookie) = request(&app, "/v1/guest/session", None, None, None).await;
    assert_eq!(status, StatusCode::OK);
    assert_eq!(body, json!({"issued":true}));
    let cookie = cookie.unwrap();
    assert!(cookie.contains("Max-Age=34560000"));
    let pair = cookie.split(';').next().unwrap();
    let Some(pool) = fresh_database().await else {
        return;
    };
    let app = router(AppState::new(Some(pool.clone())));
    assert_eq!(
        request(
            &app,
            "/puzzled.v1.StatsService/GetHistory",
            Some(pair),
            None,
            None
        )
        .await
        .0,
        StatusCode::UNAUTHORIZED
    );
    let count: i64 = sqlx::query_scalar("SELECT count(*) FROM guest_credentials")
        .fetch_one(&pool)
        .await
        .unwrap();
    assert_eq!(count, 0);
    let account = Uuid::now_v7();
    assert_eq!(
        request(
            &app,
            "/puzzled.v1.StatsService/GetHistory",
            Some(pair),
            Some(&token(&account.to_string())),
            None
        )
        .await
        .0,
        StatusCode::OK
    );
    let count: i64 = sqlx::query_scalar("SELECT count(*) FROM guest_credentials")
        .fetch_one(&pool)
        .await
        .unwrap();
    assert_eq!(count, 0);
    let _ = guest_credentials::COOKIE;
    pool.close().await;
}

async fn bootstrap_without_database(body: Value) -> (StatusCode, Value) {
    let app = router(AppState::new(None));
    let response = app
        .oneshot(
            Request::builder()
                .method("POST")
                .uri("/v1/guest/session")
                .header("content-type", "application/json")
                .header("origin", "https://puzzled.gg")
                .body(Body::from(body.to_string()))
                .unwrap(),
        )
        .await
        .unwrap();
    let status = response.status();
    let bytes = to_bytes(response.into_body(), usize::MAX).await.unwrap();
    (
        status,
        serde_json::from_slice(&bytes).unwrap_or_else(|_| json!(null)),
    )
}

#[tokio::test]
async fn legacy_claim_without_database_is_unavailable_so_the_client_keeps_its_key() {
    let (status, _) = bootstrap_without_database(json!({"legacyGuestId": Uuid::now_v7()})).await;
    assert_eq!(status, StatusCode::SERVICE_UNAVAILABLE);
}

#[tokio::test]
async fn plain_bootstrap_without_database_still_issues() {
    let (status, body) = bootstrap_without_database(json!({})).await;
    assert_eq!(status, StatusCode::OK);
    assert_eq!(body, json!({"issued": true}));
}
