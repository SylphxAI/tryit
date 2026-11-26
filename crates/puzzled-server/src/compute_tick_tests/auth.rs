use axum::http::StatusCode;
use serde_json::json;

use super::support::{assert_admitted, call, receipt, request, Provider, COMPUTE_PATHS, JOBS_PATH};

pub(super) async fn assert_exact_request_binding() {
    let provider = Provider::start(StatusCode::OK).await;
    for path in COMPUTE_PATHS.into_iter().chain([JOBS_PATH]) {
        for (case, bearer) in [
            ("missing", None),
            ("shared secret", Some("issued-events-credential".to_owned())),
            ("wrong path", Some(receipt("/other", json!({}), 7))),
            (
                "wrong audience",
                Some(receipt(
                    path,
                    json!({"aud": format!("https://other.test{path}")}),
                    7,
                )),
            ),
            (
                "expired",
                Some(receipt(path, json!({"iat": 1, "exp": 2}), 7)),
            ),
            ("forged", Some(receipt(path, json!({}), 9))),
            (
                "wrong issuer",
                Some(receipt(path, json!({"iss": "https://other.test"}), 7)),
            ),
            (
                "missing expiry",
                Some(receipt(path, json!({"exp": null}), 7)),
            ),
        ] {
            let (status, body) = call(provider.state(), request(path, bearer.as_deref())).await;
            assert_eq!(status, StatusCode::UNAUTHORIZED, "{case} {path}: {body}");
            if path != JOBS_PATH {
                let expected = if bearer.is_none() {
                    "tick_receipt_missing"
                } else {
                    "tick_receipt_invalid"
                };
                assert_eq!(body, json!({"error": expected}), "{case} {path}");
            }
        }
        let (status, body) = call(
            provider.state(),
            request(path, Some(&receipt(path, json!({}), 7))),
        )
        .await;
        assert_admitted(path, status, &body);

        let query = format!("{path}?day=2026-10-29&label=a%2Fb");
        let (status, body) = call(
            provider.state(),
            request(&query, Some(&receipt(path, json!({}), 7))),
        )
        .await;
        assert_eq!(
            status,
            StatusCode::UNAUTHORIZED,
            "changed query {path}: {body}"
        );
        let (status, body) = call(
            provider.state(),
            request(&query, Some(&receipt(&query, json!({}), 7))),
        )
        .await;
        assert_admitted(&query, status, &body);
    }
}

pub(super) async fn assert_provider_outage_refused() {
    let provider = Provider::start(StatusCode::SERVICE_UNAVAILABLE).await;
    for path in COMPUTE_PATHS.into_iter().chain([JOBS_PATH]) {
        let (status, body) = call(
            provider.state(),
            request(path, Some(&receipt(path, json!({}), 7))),
        )
        .await;
        assert_eq!(status, StatusCode::SERVICE_UNAVAILABLE, "{path}: {body}");
        if path == JOBS_PATH {
            assert_eq!(
                body["message"], "tick_receipt_unavailable",
                "{path}: {body}"
            );
        } else {
            assert_eq!(body, json!({"error": "tick_receipt_unavailable"}), "{path}");
        }
        let (status, _) = call(provider.state(), request(path, None)).await;
        assert_eq!(
            status,
            StatusCode::UNAUTHORIZED,
            "missing during outage: {path}"
        );
    }
}

pub(super) async fn assert_host_binding_and_fallback() {
    let provider = Provider::start(StatusCode::OK).await;
    for path in COMPUTE_PATHS.into_iter().chain([JOBS_PATH]) {
        let token = receipt(path, json!({}), 7);
        let mut forwarded = request(path, Some(&token));
        forwarded.headers_mut().remove("host");
        forwarded.headers_mut().insert(
            "x-forwarded-host",
            "puzzled.test".parse().unwrap_or_else(|_| panic!("host")),
        );
        let (status, body) = call(provider.state(), forwarded).await;
        assert_admitted(path, status, &body);

        let mut wrong_host = request(path, Some(&token));
        wrong_host.headers_mut().insert(
            "host",
            "other.test".parse().unwrap_or_else(|_| panic!("host")),
        );
        wrong_host.headers_mut().insert(
            "x-forwarded-host",
            "puzzled.test".parse().unwrap_or_else(|_| panic!("host")),
        );
        let (status, body) = call(provider.state(), wrong_host).await;
        assert_eq!(
            status,
            StatusCode::UNAUTHORIZED,
            "host precedence {path}: {body}"
        );

        let mut no_host = request(path, Some(&token));
        no_host.headers_mut().remove("host");
        let (status, body) = call(provider.state(), no_host).await;
        assert_eq!(
            status,
            StatusCode::UNAUTHORIZED,
            "missing host {path}: {body}"
        );
    }
}
