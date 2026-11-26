use axum::body::{to_bytes, Body};
use axum::http::{Request, StatusCode};
use serde_json::{json, Value};
use tower::ServiceExt;

pub(super) async fn request(
    app: &axum::Router,
    path: &str,
    cookie: Option<&str>,
    bearer: Option<&str>,
    guest: Option<&str>,
) -> (StatusCode, Value, Option<String>) {
    let mut req = Request::builder()
        .method("POST")
        .uri(path)
        .header("content-type", "application/json")
        .header("origin", "https://puzzled.gg");
    if let Some(cookie) = cookie {
        req = req.header("cookie", cookie);
    }
    if let Some(bearer) = bearer {
        req = req.header("authorization", format!("Bearer {bearer}"));
    }
    if let Some(guest) = guest {
        req = req
            .header("x-puzzled-guest-id", guest)
            .header("x-puzzled-verified-guest", guest);
    }
    let response = app
        .clone()
        .oneshot(req.body(Body::from("{}")).unwrap())
        .await
        .unwrap();
    let status = response.status();
    let cookie = response
        .headers()
        .get("set-cookie")
        .map(|v| v.to_str().unwrap().to_string());
    let bytes = to_bytes(response.into_body(), usize::MAX).await.unwrap();
    let body = serde_json::from_slice(&bytes).unwrap_or_else(|_| json!(null));
    (status, body, cookie)
}

pub(super) async fn puzzle_request(
    app: &axum::Router,
    method: &str,
    cookie: &str,
    bearer: Option<&str>,
    body: Value,
) -> (StatusCode, Value) {
    let mut request = Request::builder()
        .method("POST")
        .uri(format!("/puzzled.v1.PuzzleService/{method}"))
        .header("content-type", "application/json")
        .header("origin", "https://tryit.fun")
        .header("cookie", cookie);
    if let Some(bearer) = bearer {
        request = request.header("authorization", format!("Bearer {bearer}"));
    }
    let response = app
        .clone()
        .oneshot(request.body(Body::from(body.to_string())).unwrap())
        .await
        .unwrap();
    let status = response.status();
    let bytes = to_bytes(response.into_body(), usize::MAX).await.unwrap();
    (status, serde_json::from_slice(&bytes).unwrap())
}

pub(super) async fn bootstrap(
    app: &axum::Router,
    origin: &str,
    cookie: Option<&str>,
    body: Value,
) -> (StatusCode, Value, Vec<String>) {
    let mut req = Request::builder()
        .method("POST")
        .uri("/v1/guest/session")
        .header("content-type", "application/json")
        .header("origin", origin);
    if let Some(cookie) = cookie {
        req = req.header("cookie", cookie);
    }
    let response = app
        .clone()
        .oneshot(req.body(Body::from(body.to_string())).unwrap())
        .await
        .unwrap();
    let status = response.status();
    let cookies = response
        .headers()
        .get_all("set-cookie")
        .iter()
        .map(|v| v.to_str().unwrap().to_string())
        .collect();
    let bytes = to_bytes(response.into_body(), usize::MAX).await.unwrap();
    (
        status,
        serde_json::from_slice(&bytes).unwrap_or(json!(null)),
        cookies,
    )
}
