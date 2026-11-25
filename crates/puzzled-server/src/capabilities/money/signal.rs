//! The checkout-start analytics event is observational, never part of payment
//! or the settlement/conversion outbox. Only Money knows the created checkout ID.
use std::sync::{Arc, OnceLock};
use std::time::Duration;

use base64::{engine::general_purpose::URL_SAFE_NO_PAD, Engine as _};
use serde_json::{json, Value};
use sha2::{Digest, Sha256};
use tokio::sync::Semaphore;

use super::checkout_attribution::CheckoutAttribution;

const INGEST_PATH: &str = "/v1/analytics/events:batch";
const INGEST_TIMEOUT: Duration = Duration::from_secs(10);

pub(super) fn checkout_started(
    origin: &str,
    key: Option<&str>,
    session_id: &str,
    measurement: &CheckoutAttribution<'_>,
) {
    let Some(key) = key.filter(|key| key.starts_with("sylphx_pk_")) else {
        return;
    };
    let Some(payload) = batch(session_id, measurement) else {
        return;
    };
    static CLIENT: OnceLock<Option<reqwest::Client>> = OnceLock::new();
    let Some(client) = CLIENT.get_or_init(|| {
        reqwest::Client::builder()
            .redirect(reqwest::redirect::Policy::none())
            .build()
            .ok()
    }) else {
        return;
    };
    // A slow or refusing analytics API must not hold checkout open or create
    // an unbounded queue. Drop excess measurements, never payment requests.
    static IN_FLIGHT: OnceLock<Arc<Semaphore>> = OnceLock::new();
    let Ok(permit) = IN_FLIGHT
        .get_or_init(|| Arc::new(Semaphore::new(16)))
        .clone()
        .try_acquire_owned()
    else {
        return;
    };
    let Ok(request) = ingest_request(client, origin, key, &payload) else {
        return;
    };
    tokio::spawn(async move {
        let _permit = permit;
        match client.execute(request).await {
            Ok(response) if response.status().is_success() => {}
            Ok(response) => tracing::debug!(
                status = response.status().as_u16(),
                "checkout Signal ingest refused"
            ),
            Err(_) => tracing::debug!("checkout Signal ingest unavailable"),
        }
    });
}

fn ingest_request(
    client: &reqwest::Client,
    origin: &str,
    key: &str,
    payload: &Value,
) -> Result<reqwest::Request, reqwest::Error> {
    client
        .post(format!("{origin}{INGEST_PATH}"))
        .timeout(INGEST_TIMEOUT)
        .header("x-sylphx-key", key)
        .json(payload)
        .build()
}

fn batch(session_id: &str, measurement: &CheckoutAttribution<'_>) -> Option<Value> {
    if !measurement.analytics_granted() || session_id.is_empty() {
        return None;
    }
    let digest = Sha256::digest(session_id.as_bytes());
    let checkout = format!("checkout:{}", URL_SAFE_NO_PAD.encode(digest));
    let mut properties = json!({});
    if let Some(surface) = measurement.entry_surface {
        properties["entry_surface"] = json!(surface);
    }
    Some(json!({
        "consent": "granted",
        "events": [{
            "event_name": "checkout_started",
            "event_id": format!("{checkout}:started"),
            "distinct_id": checkout,
            "session_id": checkout,
            "event_time": jiff::Timestamp::now().to_string(),
            "properties": properties,
            "is_error": false,
        }],
    }))
}

#[cfg(test)]
mod tests {
    use super::*;
    use axum::http::HeaderMap;

    #[test]
    fn signal_batch_request_uses_configured_origin_and_ten_second_deadline() {
        let request = ingest_request(
            &reqwest::Client::new(),
            "https://signal.example.test",
            "sylphx_pk_local_fixture",
            &json!({ "consent": "granted", "events": [] }),
        )
        .unwrap();
        assert_eq!(
            request.url().as_str(),
            "https://signal.example.test/v1/analytics/events:batch"
        );
        assert_eq!(request.timeout(), Some(&Duration::from_secs(10)));
    }

    #[test]
    fn event_id_is_stable_for_a_checkout_and_distinct_across_checkouts() {
        let mut headers = HeaderMap::new();
        headers.insert(
            "x-puzzled-signal-consent",
            "granted,denied,denied,denied".parse().unwrap(),
        );
        let measure = CheckoutAttribution::from_headers(&headers);
        let id = |checkout| batch(checkout, &measure).unwrap()["events"][0]["event_id"].clone();
        assert_eq!(id("chk_1"), id("chk_1"));
        assert_ne!(id("chk_1"), id("chk_2"));
        assert_eq!(
            id("chk_1"),
            "checkout:8jKkhsYPutbkNdjIYVnTWul7ndmOATa4UaR107l8jh4:started"
        );
        headers.insert("sec-gpc", "0, 1".parse().unwrap());
        assert!(batch("chk_1", &CheckoutAttribution::from_headers(&headers)).is_none());
        assert!(batch("chk_1", &CheckoutAttribution::default()).is_none());
    }
}
