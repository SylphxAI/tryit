use axum::body::{to_bytes, Body};
use axum::http::{Method, Request, StatusCode};
use axum::response::Response;
use base64::{engine::general_purpose::URL_SAFE_NO_PAD, Engine as _};
use ed25519_dalek::{Signer as _, SigningKey};
use serde_json::{json, Value};
use sylphx::auth::verify::{CALLBACK_RECEIPT_ISSUER, CALLBACK_RECEIPT_TYP};
use tower::ServiceExt;

use crate::{router, AppState};

const TRYIT_CONVERSIONS_PATH: &str = "/internal/compute/tryit-conversions";
pub(super) const COMPUTE_PATHS: [&str; 5] = [
    "/internal/compute/daily-puzzles",
    "/internal/compute/audit-log-retention",
    "/internal/compute/daily-reminders",
    TRYIT_CONVERSIONS_PATH,
    "/internal/compute/product-metrics",
];
pub(super) const JOBS_PATH: &str = "/puzzled.v1.JobsService/RunRetentionJob";

pub(super) struct Provider {
    url: String,
    task: tokio::task::JoinHandle<()>,
}

impl Drop for Provider {
    fn drop(&mut self) {
        self.task.abort();
    }
}

impl Provider {
    pub(super) async fn start(status: StatusCode) -> Self {
        let key = SigningKey::from_bytes(&[7; 32]);
        // Public keys have the same shape as Compute's published JWKS.
        let keys = json!({"keys": [{
            "issuer": CALLBACK_RECEIPT_ISSUER, "typ": CALLBACK_RECEIPT_TYP,
            "kty": "OKP", "crv": "Ed25519", "alg": "EdDSA", "use": "sig",
            "kid": "compute-tick-1",
            "x": URL_SAFE_NO_PAD.encode(key.verifying_key().as_bytes()),
            "not_before_unix_seconds": 0, "not_after_unix_seconds": 4_102_444_800i64
        }]});
        let app = axum::Router::new().route(
            "/jwks",
            axum::routing::get(move || async move { (status, axum::Json(keys)) }),
        );
        let listener = tokio::net::TcpListener::bind("127.0.0.1:0")
            .await
            .unwrap_or_else(|e| panic!("JWKS bind: {e}"));
        let addr = listener
            .local_addr()
            .unwrap_or_else(|e| panic!("JWKS addr: {e}"));
        Self {
            url: format!("http://{addr}/jwks"),
            task: tokio::spawn(async move {
                axum::serve(listener, app)
                    .await
                    .unwrap_or_else(|e| panic!("JWKS serve: {e}"));
            }),
        }
    }

    pub(super) fn state(&self) -> AppState {
        AppState::new(None)
            .with_tick_jwks_url(self.url.clone())
            .with_tick_private_origin(Some("http://api.env-test.sylphx.internal"))
    }
}

pub(super) fn receipt(path: &str, overrides: Value, seed: u8) -> String {
    let now = chrono::Utc::now().timestamp();
    let header = URL_SAFE_NO_PAD.encode(
        json!({"alg": "EdDSA", "typ": CALLBACK_RECEIPT_TYP, "kid": "compute-tick-1"}).to_string(),
    );
    let mut claims = json!({
        "iss": CALLBACK_RECEIPT_ISSUER, "aud": format!("https://api.env-test.sylphx.internal{path}"),
        "schedule_id": "puzzled-test", "tick_id": "tick-1", "iat": now, "exp": now + 300
    });
    for (key, value) in overrides
        .as_object()
        .unwrap_or_else(|| panic!("overrides object"))
    {
        claims[key] = value.clone();
    }
    let payload = URL_SAFE_NO_PAD.encode(claims.to_string());
    let signed = format!("{header}.{payload}");
    let signature = SigningKey::from_bytes(&[seed; 32]).sign(signed.as_bytes());
    format!("{signed}.{}", URL_SAFE_NO_PAD.encode(signature.to_bytes()))
}

pub(super) fn request(path: &str, bearer: Option<&str>) -> Request<Body> {
    let mut builder = Request::builder()
        .method(Method::POST)
        .uri(path)
        .header("host", "puzzled.test")
        .header("content-type", "application/json");
    if let Some(token) = bearer {
        builder = builder.header("authorization", format!("Bearer {token}"));
    }
    builder
        .body(Body::from(r#"{"name":"audit-log-retention"}"#))
        .unwrap_or_else(|e| panic!("callback request: {e}"))
}

pub(super) async fn call(state: AppState, request: Request<Body>) -> (StatusCode, Value) {
    let response: Response = router(state)
        .oneshot(request)
        .await
        .unwrap_or_else(|e| panic!("callback: {e}"));
    let status = response.status();
    let bytes = to_bytes(response.into_body(), 1024 * 1024)
        .await
        .unwrap_or_else(|e| panic!("callback body: {e}"));
    let json = serde_json::from_slice(&bytes).unwrap_or_else(|e| panic!("callback JSON: {e}"));
    (status, json)
}

pub(super) fn assert_admitted(path: &str, status: StatusCode, body: &Value) {
    // Prove execution reached the existing no-database result, not an
    // authentication 503 mistaken for an admitted callback.
    if path.starts_with(JOBS_PATH) {
        assert_eq!(status, StatusCode::OK, "{path}: {body}");
        // Proto JSON may omit the default false scalar.
        assert!(!body["ok"].as_bool().unwrap_or(false));
        assert_eq!(body["errors"], json!(["no database pool"]));
    } else {
        assert_eq!(status, StatusCode::SERVICE_UNAVAILABLE, "{path}: {body}");
        let expected = if path.starts_with(TRYIT_CONVERSIONS_PATH) {
            "not_configured"
        } else {
            "no_database"
        };
        assert_eq!(body["error"], expected, "{path}: {body}");
    }
}
