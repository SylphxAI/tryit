use std::sync::{Arc, Mutex};

use axum::http::StatusCode;
use base64::{engine::general_purpose::URL_SAFE_NO_PAD, Engine as _};
use serde_json::json;
use tracing::instrument::WithSubscriber as _;
use tracing_subscriber::fmt::MakeWriter;

use super::support::{assert_admitted, call, receipt, request, Provider, COMPUTE_PATHS};

#[derive(Clone, Default)]
struct TickLogs(Arc<Mutex<Vec<u8>>>);

impl<'a> MakeWriter<'a> for TickLogs {
    type Writer = <Mutex<Vec<u8>> as MakeWriter<'a>>::Writer;

    fn make_writer(&'a self) -> Self::Writer {
        self.0.make_writer()
    }
}

pub(super) async fn assert_rejection_warning_redacted() {
    let provider = Provider::start(StatusCode::OK).await;
    let logs = TickLogs::default();
    // Keep the callsite interest shared: with only one registered dispatcher,
    // an unrelated test without a subscriber can first register it as disabled.
    let _other = tracing::Dispatch::new(tracing::subscriber::NoSubscriber::default());
    let subscriber = tracing_subscriber::fmt()
        .with_writer(logs.clone())
        .without_time()
        .with_ansi(false)
        .with_max_level(tracing::Level::WARN)
        .finish();
    let path = COMPUTE_PATHS[0];
    let sdk_payload = "test-algorithm-not-for-logs";
    let header = URL_SAFE_NO_PAD.encode(json!({"alg": sdk_payload}).to_string());
    let invalid_receipt = format!("{header}.fixture.fixture");
    let query_value = "test-query-not-for-logs";
    let mut req = request(
        &format!("{path}?test={query_value}"),
        Some(&invalid_receipt),
    );
    req.headers_mut().insert(
        "x-forwarded-host",
        invalid_receipt
            .parse()
            .unwrap_or_else(|_| panic!("forwarded host fixture")),
    );
    req.headers_mut().insert(
        "x-forwarded-proto",
        "http"
            .parse()
            .unwrap_or_else(|_| panic!("protocol fixture")),
    );

    let (status, body) = call(provider.state(), req)
        .with_subscriber(subscriber)
        .await;
    assert_eq!(status, StatusCode::UNAUTHORIZED);
    assert_eq!(body, json!({"error": "tick_receipt_invalid"}));

    let bytes = logs.0.lock().unwrap_or_else(|e| panic!("log buffer: {e}"));
    let output = std::str::from_utf8(&bytes).unwrap_or_else(|e| panic!("log encoding: {e}"));
    assert!(!output.contains(&invalid_receipt));
    assert!(!output.contains(sdk_payload));
    assert!(!output.contains(query_value));
    assert_eq!(output.matches("compute tick rejected").count(), 1);
    for field in [
        "WARN",
        "reason=\"tick_receipt_invalid\"",
        "verify_error=\"algorithm\"",
        "host=\"puzzled.test\"",
        "forwarded_host=\"-\"",
        "forwarded_proto=\"http\"",
        &format!("path=\"{path}\""),
    ] {
        assert!(output.contains(field), "missing diagnostic field: {field}");
    }
}

pub(super) async fn assert_admission_info_redacted() {
    let provider = Provider::start(StatusCode::OK).await;
    let logs = TickLogs::default();
    // As in the warning test, keep callsite interest shared with parallel tests.
    let _other = tracing::Dispatch::new(tracing::subscriber::NoSubscriber::default());
    let subscriber = tracing_subscriber::fmt()
        .with_writer(logs.clone())
        .without_time()
        .with_ansi(false)
        .with_max_level(tracing::Level::INFO)
        .finish();
    let path = COMPUTE_PATHS[0];
    let query_value = "test-admission-query-not-for-logs";
    let path_and_query = format!("{path}?test={query_value}");
    let signed_receipt = receipt(&path_and_query, json!({}), 7);
    let mut req = request(&path_and_query, Some(&signed_receipt));
    req.headers_mut().insert(
        "x-forwarded-host",
        signed_receipt
            .parse()
            .unwrap_or_else(|_| panic!("forwarded host fixture")),
    );
    req.headers_mut().insert(
        "x-forwarded-proto",
        "https"
            .parse()
            .unwrap_or_else(|_| panic!("protocol fixture")),
    );

    let (status, body) = call(provider.state(), req)
        .with_subscriber(subscriber)
        .await;
    assert_admitted(&path_and_query, status, &body);

    let bytes = logs.0.lock().unwrap_or_else(|e| panic!("log buffer: {e}"));
    let output = std::str::from_utf8(&bytes).unwrap_or_else(|e| panic!("log encoding: {e}"));
    assert!(!output.contains(&signed_receipt));
    assert!(!output.contains(query_value));
    assert!(!output.contains("?test="));
    assert!(!output.contains("compute tick rejected"));
    assert_eq!(output.matches("compute tick admitted").count(), 1);
    let event = output
        .lines()
        .find(|line| line.contains("compute tick admitted"))
        .unwrap_or_else(|| panic!("missing admission event"));
    for field in ["INFO", "status=200", &format!("path=\"{path}\"")] {
        assert!(
            event.split_whitespace().any(|part| part == field),
            "missing admission field: {field}"
        );
    }
}
