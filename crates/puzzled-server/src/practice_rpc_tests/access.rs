use std::sync::Arc;

use axum::http::StatusCode;
use axum::routing::get;
use axum::{Json, Router};
use serde_json::{json, Value};

use super::{
    assert_no_ritual_rows, fresh_database, rpc, spawn_money, token, Fake, OUTAGE, PAID,
    PRACTICE_RPCS, UNPAID,
};
use crate::capabilities::identity_access::adapters::guest_credentials;
use crate::capabilities::money::Money;
use crate::{router, AppState};

fn assert_denied((status, body): (StatusCode, Value), expected: StatusCode, message: &str) {
    assert_eq!(status, expected, "{body}");
    assert_eq!(body["message"], message);
    assert_eq!(
        body["code"],
        if expected == StatusCode::UNAUTHORIZED {
            "unauthenticated"
        } else {
            "permission_denied"
        }
    );
}

pub(super) async fn practice_requires_an_account_and_fails_closed_on_money_errors() {
    let Some(pool) = fresh_database().await else {
        return;
    };
    let guest = guest_credentials::issue(&pool).await.unwrap();
    let cookie = guest.split(';').next().unwrap();
    let unpaid = token(UNPAID);
    let paid = token(PAID);
    let outage = token(OUTAGE);
    let fake: Fake = Arc::default();
    fake.lock().unwrap().paid.push(PAID.into());
    let money = spawn_money(fake.clone()).await;
    let app = router(AppState::new(Some(pool.clone())).with_money(Some(money)));
    // Fail the entitlement read while catalogue is open. Use an uncached subject.
    for method in PRACTICE_RPCS {
        for browser_cookie in [None, Some(cookie)] {
            assert_denied(
                rpc(&app, method, json!({}), None, browser_cookie).await,
                StatusCode::UNAUTHORIZED,
                "identity_required_for_practice",
            );
        }
        assert_denied(
            rpc(&app, method, json!({}), Some(&unpaid), None).await,
            StatusCode::FORBIDDEN,
            "plus_required_for_practice",
        );
    }
    fake.lock().unwrap().down = true;
    for method in PRACTICE_RPCS {
        assert_denied(
            rpc(&app, method, json!({}), Some(&outage), None).await,
            StatusCode::FORBIDDEN,
            "plus_required_for_practice",
        );
    }

    // No sellable catalogue is different from a catalogue that cannot answer.
    let listener = tokio::net::TcpListener::bind("127.0.0.1:0").await.unwrap();
    let addr = listener.local_addr().unwrap();
    let broken = Router::new().route(
        "/v1/orgs/o/projects/p/envs/e/price_catalogs/default",
        get(|| async { (StatusCode::SERVICE_UNAVAILABLE, Json(json!({}))) }),
    );
    let server = tokio::spawn(async move { axum::serve(listener, broken).await.unwrap() });
    let money = Money::new(
        &format!("http://{addr}/v1/orgs/o/projects/p/envs/e"),
        "sk_test",
        "https://puzzled.test",
    );
    let broken_app = router(AppState::new(Some(pool.clone())).with_money(Some(money)));
    for method in PRACTICE_RPCS {
        assert_denied(
            rpc(&broken_app, method, json!({}), Some(&paid), None).await,
            StatusCode::FORBIDDEN,
            "plus_required_for_practice",
        );
    }
    server.abort();
    let closed = router(AppState::new(Some(pool.clone())));
    let (status, body) = rpc(
        &closed,
        "GetPracticePuzzle",
        json!({"gameSlug":"word-guess"}),
        Some(&unpaid),
        None,
    )
    .await;
    assert_eq!(status, StatusCode::OK, "{body}");
    assert_no_ritual_rows(&pool).await;
}
