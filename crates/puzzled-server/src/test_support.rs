//! Shared fixtures for scratch Postgres, Platform JWTs, and HTTP/Connect tests.
//! Needs `PUZZLED_TEST_DATABASE_URL` (CI sets it and `PUZZLED_REQUIRE_DB_TESTS=1`,
//! so a missing database fails there instead of skipping).

use axum::body::{to_bytes, Body};
use axum::http::{Method, Request};
use axum::response::Response;
use serde_json::json;
use sqlx::postgres::PgPoolOptions;
use sqlx::PgPool;

pub(crate) async fn fresh_database() -> Option<PgPool> {
    let Ok(admin_url) = std::env::var("PUZZLED_TEST_DATABASE_URL") else {
        assert!(
            std::env::var("PUZZLED_REQUIRE_DB_TESTS").is_err(),
            "PUZZLED_TEST_DATABASE_URL is required here"
        );
        eprintln!("skipping database test: PUZZLED_TEST_DATABASE_URL is not set");
        return None;
    };
    let admin = PgPoolOptions::new()
        .max_connections(1)
        .connect(&admin_url)
        .await
        .unwrap();
    let name = format!("puzzled_test_{}", uuid::Uuid::now_v7().simple());
    sqlx::query(sqlx::AssertSqlSafe(format!("CREATE DATABASE {name}")))
        .execute(&admin)
        .await
        .unwrap();
    let mut url = reqwest::Url::parse(&admin_url).unwrap();
    url.set_path(&format!("/{name}"));
    let pool = PgPoolOptions::new()
        .max_connections(4)
        .connect(url.as_str())
        .await
        .unwrap();
    let dir = std::path::Path::new(env!("CARGO_MANIFEST_DIR"))
        .join("../../apps/puzzled/atlas/migrations");
    let mut files: Vec<_> = std::fs::read_dir(&dir)
        .unwrap()
        .filter_map(Result::ok)
        .map(|e| e.path())
        .filter(|p| p.extension().is_some_and(|e| e == "sql"))
        .collect();
    files.sort();
    for file in files {
        let sql = std::fs::read_to_string(&file).unwrap();
        sqlx::raw_sql(sqlx::AssertSqlSafe(sql))
            .execute(&pool)
            .await
            .unwrap_or_else(|e| panic!("{}: {e}", file.display()));
    }
    Some(pool)
}

pub(crate) fn token(sub: &str) -> String {
    use jsonwebtoken::{encode, EncodingKey, Header};
    let priv_pem = include_str!("../testdata/platform_jwt_test_priv.pem");
    let claims = json!({"sub": sub, "name": "Player", "email": "player@example.com",
                        "exp": chrono::Utc::now().timestamp() + 3600});
    encode(
        &Header::new(jsonwebtoken::Algorithm::RS256),
        &claims,
        &EncodingKey::from_rsa_pem(priv_pem.as_bytes()).unwrap(),
    )
    .unwrap()
}

pub(crate) fn build_connect_request(uri: &str, body: Body) -> Request<Body> {
    match Request::builder()
        .method(Method::POST)
        .uri(uri)
        .header(axum::http::header::CONTENT_TYPE, "application/json")
        .body(body)
    {
        Ok(request) => request,
        Err(error) => panic!("build connect request {uri}: {error}"),
    }
}

pub(crate) fn mint_test_token(sub: &str) -> String {
    mint_test_token_with_scope(sub, None)
}

pub(crate) fn mint_test_token_with_scope(sub: &str, scope: Option<&str>) -> String {
    use jsonwebtoken::{encode, EncodingKey, Header as JwtHeader};
    let priv_pem = include_str!("../testdata/platform_jwt_test_priv.pem");
    #[derive(serde::Serialize)]
    struct MintClaims {
        sub: String,
        name: String,
        exp: i64,
        #[serde(skip_serializing_if = "Option::is_none")]
        scope: Option<String>,
    }
    let claims = MintClaims {
        sub: sub.to_string(),
        name: "Test User".to_string(),
        exp: chrono::Utc::now().timestamp() + 3600,
        scope: scope.map(str::to_string),
    };
    let key = EncodingKey::from_rsa_pem(priv_pem.as_bytes()).expect("enc key");
    encode(
        &JwtHeader::new(jsonwebtoken::Algorithm::RS256),
        &claims,
        &key,
    )
    .expect("mint")
}

pub(crate) fn build_connect_request_with_auth(uri: &str, body: Body, token: &str) -> Request<Body> {
    match Request::builder()
        .method(Method::POST)
        .uri(uri)
        .header(axum::http::header::CONTENT_TYPE, "application/json")
        .header(axum::http::header::AUTHORIZATION, format!("Bearer {token}"))
        .body(body)
    {
        Ok(request) => request,
        Err(error) => panic!("build connect request {uri}: {error}"),
    }
}

pub(crate) fn connect_error_message(json: &serde_json::Value) -> &str {
    json.get("message").and_then(|v| v.as_str()).unwrap_or("")
}

pub(crate) async fn body_json(response: Response) -> serde_json::Value {
    let body = match to_bytes(response.into_body(), usize::MAX).await {
        Ok(body) => body,
        Err(error) => panic!("read body: {error}"),
    };
    match serde_json::from_slice(&body) {
        Ok(json) => json,
        Err(error) => panic!("parse json: {error}"),
    }
}
