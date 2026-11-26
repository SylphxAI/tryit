//! Money client, entitlement, checkout and pricing tests with shared fixtures.

use std::sync::{Arc, Mutex};

use axum::extract::State;
use axum::http::StatusCode;
use axum::routing::{get, post};
use axum::{Json, Router};
use serde_json::{json, Value};

use super::client::{Catalog, Money};

mod attribution;
mod checkout;
mod client;
mod entitlements;
mod guest_checkout;
mod pricing;
mod subscriptions;

const USER: &str = "0190a0a0-0000-7000-8000-000000000001";

#[derive(Default)]
struct FakeMoney {
    actions: Vec<String>,
    status: u16,
    answer: Value,
    checks: Vec<Value>,
    sessions: Vec<Value>,
    bindings: Vec<Value>,
    signals: Vec<Value>,
    catalog: Value,
}

type Fake = Arc<Mutex<FakeMoney>>;

async fn check(State(fake): State<Fake>, Json(body): Json<Value>) -> (StatusCode, Json<Value>) {
    let mut fake = fake.lock().unwrap();
    fake.checks.push(body);
    (
        StatusCode::from_u16(fake.status).unwrap(),
        Json(fake.answer.clone()),
    )
}

async fn session(State(fake): State<Fake>, Json(body): Json<Value>) -> Json<Value> {
    fake.lock().unwrap().sessions.push(body);
    Json(
        json!({"name": "orgs/o/projects/p/envs/e/checkout_sessions/chk_1", "url": "https://checkout.example/pay/cs_1", "state": "open"}),
    )
}

async fn subscriptions(State(fake): State<Fake>) -> (StatusCode, Json<Value>) {
    let fake = fake.lock().unwrap();
    (
        StatusCode::from_u16(fake.status).unwrap(),
        Json(fake.answer.clone()),
    )
}

async fn action(
    State(fake): State<Fake>,
    axum::extract::Path(rest): axum::extract::Path<String>,
    Json(body): Json<Value>,
) -> Json<Value> {
    fake.lock().unwrap().actions.push(format!("{rest} {body}"));
    Json(json!({}))
}

async fn portal(State(fake): State<Fake>, Json(body): Json<Value>) -> (StatusCode, Json<Value>) {
    let mut fake = fake.lock().unwrap();
    fake.actions.push(format!("portal {body}"));
    (
        StatusCode::from_u16(fake.status).unwrap(),
        Json(json!({"url": "https://portal.example/p/1"})),
    )
}

async fn catalog(State(fake): State<Fake>) -> Json<Value> {
    Json(fake.lock().unwrap().catalog.clone())
}

/// A Money whose answer is `answer` with HTTP `status`.
async fn fake_money(status: u16, answer: Value) -> (Money, Fake) {
    let fake: Fake = Arc::new(Mutex::new(FakeMoney {
        status,
        answer,
        catalog: catalog_fixture(&[]),
        ..Default::default()
    }));
    let app = fake_money_router(fake.clone());
    let listener = tokio::net::TcpListener::bind("127.0.0.1:0").await.unwrap();
    let addr = listener.local_addr().unwrap();
    tokio::spawn(async move { axum::serve(listener, app).await.unwrap() });
    (
        Money::new(
            &format!("http://{addr}/v1/orgs/o/projects/p/envs/e"),
            "sk_test",
            "https://puzzled.test",
        ),
        fake,
    )
}

fn fake_money_router(fake: Fake) -> Router {
    Router::new()
        .route(
            "/v1/orgs/o/projects/p/envs/e/entitlement_grants:check",
            post(check),
        )
        .route(
            "/v1/orgs/o/projects/p/envs/e/checkout_sessions",
            post(session),
        )
        .route(
            "/v1/orgs/o/projects/p/envs/e/price_catalogs/default",
            get(catalog),
        )
        .route(
            "/v1/orgs/o/projects/p/envs/e/customer_subscriptions",
            get(subscriptions),
        )
        .route(
            "/v1/orgs/o/projects/p/envs/e/customer_subscriptions/{*rest}",
            post(action),
        )
        .route("/v1/orgs/o/projects/p/envs/e/portal_sessions", post(portal))
        .route(
            "/v1/events/attribution_bindings",
            post(
                |State(fake): State<Fake>,
                 headers: axum::http::HeaderMap,
                 Json(body): Json<Value>| async move {
                    assert_eq!(headers["x-sylphx-key"], "sylphx_pk_local_fixture");
                    assert!(!headers.contains_key("authorization"));
                    assert!(!headers.contains_key("cookie"));
                    assert!(!headers.contains_key("referer"));
                    fake.lock().unwrap().bindings.push(body);
                    StatusCode::SERVICE_UNAVAILABLE // attribution failure must not block checkout
                },
            ),
        )
        .route(
            "/v1/analytics/events:batch",
            post(
                |State(fake): State<Fake>,
                 headers: axum::http::HeaderMap,
                 Json(batch): Json<Value>| async move {
                    assert_eq!(headers["x-sylphx-key"], "sylphx_pk_local_fixture");
                    assert!(!headers.contains_key("authorization"));
                    assert!(!headers.contains_key("cookie"));
                    assert!(!headers.contains_key("referer"));
                    assert!(!headers.contains_key("sec-gpc"));
                    let mut fake = fake.lock().unwrap();
                    fake.signals.push(batch);
                    StatusCode::FORBIDDEN
                },
            ),
        )
        .with_state(fake)
}

/// Money's catalogue: keys and amounts are arbitrary on purpose, so nothing in
/// the code can depend on them. `archived` lists price keys Money archived.
fn catalog_fixture(archived: &[&str]) -> Value {
    let price = |key: &str, interval: &str, usd: i64| {
        json!({
            "key": key, "recurring_interval": interval, "tax_behavior": "inclusive",
            "archived": archived.contains(&key),
            "trial_days": if key == "k_solo_y" { 7 } else { 0 },
            "unit_amounts": {"USD": usd.to_string(), "GBP": (usd - 100).to_string()},
        })
    };
    json!({"spec": {"products": [
        {"key": "fam", "display_name": "Family",
         "features": {"plus": "true", "family": "true", "seats": "4"},
         "prices": [price("k_fam_y", "year", 6100), price("k_fam_m", "month", 1200)]},
        {"key": "solo", "display_name": "Plus",
         "features": {"plus": "true", "seats": "1"},
         "prices": [price("k_solo_m", "month", 1100), price("k_solo_y", "year", 5100)]},
        {"key": "other", "display_name": "Not Plus", "features": {"pro": "true"},
         "prices": [price("k_other_m", "month", 9900)]}
    ]}})
}

fn parsed(value: Value) -> Catalog {
    serde_json::from_value(value).unwrap()
}

fn granted() -> Value {
    json!({"entitled": true, "entitlement_grant": "g1"})
}
