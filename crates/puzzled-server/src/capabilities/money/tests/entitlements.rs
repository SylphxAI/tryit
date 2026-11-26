use std::time::Duration;

use serde_json::json;

use super::super::access::{family_active, is_premium, seats, FEATURE_PLUS, FEATURE_SEATS};
use super::super::Money;
use super::{fake_money, granted, USER};

#[tokio::test]
async fn granted_check_makes_the_account_premium() {
    let (money, fake) = fake_money(200, granted()).await;
    assert!(is_premium(&money, USER).await);
    let sent = fake.lock().unwrap().checks[0].clone();
    assert_eq!(sent["subject"]["end_user"], USER);
    assert_eq!(sent["feature"], FEATURE_PLUS);
}

#[tokio::test]
async fn denied_check_is_not_premium() {
    let (money, _) = fake_money(200, json!({"entitled": false})).await;
    assert!(!is_premium(&money, USER).await);
    assert!(!family_active(&money, USER).await);
}

#[tokio::test]
async fn money_unavailable_fails_closed() {
    let (money, _) = fake_money(503, json!({"title": "down"})).await;
    assert!(!is_premium(&money, USER).await);
    let (money, _) = fake_money(200, json!("not an object")).await;
    assert!(!is_premium(&money, USER).await);
    // Nothing listens here at all.
    let gone = Money::new("http://127.0.0.1:1/env", "sk_test", "https://puzzled.test");
    assert!(!is_premium(&gone, USER).await);
}

#[tokio::test]
async fn answers_are_cached_and_a_failure_is_cached_briefly() {
    let (money, fake) = fake_money(200, granted()).await;
    assert!(is_premium(&money, USER).await);
    assert!(is_premium(&money, USER).await);
    assert_eq!(
        fake.lock().unwrap().checks.len(),
        1,
        "second read is cached"
    );
    // A different feature or subject is a different answer.
    assert!(family_active(&money, USER).await);
    assert_eq!(fake.lock().unwrap().checks.len(), 2);
    // A failed call is cached as "not entitled", but only for 5 seconds.
    let (money, fake) = fake_money(503, json!({})).await;
    assert!(!is_premium(&money, USER).await);
    assert!(!is_premium(&money, USER).await);
    assert_eq!(
        fake.lock().unwrap().checks.len(),
        1,
        "an outage is not retried per request"
    );
    // Another feature is its own answer.
    assert!(!family_active(&money, USER).await);
    assert_eq!(fake.lock().unwrap().checks.len(), 2);
}

#[tokio::test]
async fn cache_never_runs_past_expire_time() {
    let ends = chrono::Utc::now() + chrono::Duration::milliseconds(1200);
    let (money, fake) = fake_money(
        200,
        json!({"entitled": true, "expire_time": ends.to_rfc3339()}),
    )
    .await;
    assert!(is_premium(&money, USER).await);
    tokio::time::sleep(Duration::from_millis(1400)).await;
    // The cache window (60 s) is far from over, but the grant has ended: the
    // check goes back to Money, which now answers with an ended grant.
    assert!(!is_premium(&money, USER).await);
    assert_eq!(fake.lock().unwrap().checks.len(), 2);
}

#[tokio::test]
async fn an_answer_already_past_its_end_grants_nothing() {
    let past = chrono::Utc::now() - chrono::Duration::seconds(5);
    let (money, _) = fake_money(
        200,
        json!({"entitled": true, "expire_time": past.to_rfc3339()}),
    )
    .await;
    assert!(!is_premium(&money, USER).await);
}

#[tokio::test]
async fn seats_is_a_limit_feature() {
    let (money, fake) = fake_money(200, json!({"entitled": true, "limit": "4"})).await;
    assert_eq!(seats(&money, USER).await, Ok(Some(4)));
    assert_eq!(fake.lock().unwrap().checks[0]["feature"], FEATURE_SEATS);
    let (money, _) = fake_money(200, json!({"entitled": false})).await;
    assert_eq!(seats(&money, USER).await, Ok(None));
    // Money unable to answer is an error, not "no seats".
    let (down, _) = fake_money(503, json!({})).await;
    assert!(seats(&down, USER).await.is_err());
}

#[tokio::test]
async fn a_failed_check_is_asked_again_after_five_seconds() {
    let (money, fake) = fake_money(503, json!({})).await;
    assert!(!is_premium(&money, USER).await);
    tokio::time::sleep(super::super::client::FAILED_CACHE_TTL + Duration::from_millis(300)).await;
    assert!(!is_premium(&money, USER).await);
    assert_eq!(fake.lock().unwrap().checks.len(), 2);
    // Money recovers: the next answer after the window is the real one.
    {
        let mut f = fake.lock().unwrap();
        f.status = 200;
        f.answer = granted();
    }
    tokio::time::sleep(super::super::client::FAILED_CACHE_TTL + Duration::from_millis(300)).await;
    assert!(is_premium(&money, USER).await);
}

#[tokio::test]
async fn access_is_money_alone_and_fails_closed() {
    let Some(pool) = crate::test_support::fresh_database().await else {
        return;
    };
    let (granted, _) = fake_money(200, json!({"entitled": true})).await;
    let e = crate::capabilities::billing::service::access(&pool, Some(&granted), USER)
        .await
        .unwrap();
    assert!(e.entitled && e.family_owner.is_none());
    let (down, _) = fake_money(503, json!({})).await;
    let e = crate::capabilities::billing::service::access(&pool, Some(&down), USER)
        .await
        .unwrap();
    assert!(!e.entitled);
    let none = crate::capabilities::billing::service::access(&pool, None, USER)
        .await
        .unwrap();
    assert!(!none.entitled);
}

#[tokio::test]
async fn an_empty_check_answer_is_not_entitled_and_not_an_error() {
    // Money omits a false boolean: a 2xx `{}` is `entitled: false`.
    let (money, _) = fake_money(200, json!({})).await;
    let grant = money
        .try_check(USER, "plus")
        .await
        .expect("a 2xx `{}` answered");
    assert!(!grant.entitled);
    assert_eq!(super::super::access::seats(&money, USER).await, Ok(None));
}

#[tokio::test]
async fn checkout_refresh_rechecks_only_the_buyers_grants_without_granting_access() {
    let (money, fake) = fake_money(200, json!({"entitled": false})).await;
    let other = "0190a0a0-0000-7000-8000-000000000002";
    assert!(!is_premium(&money, USER).await);
    assert!(!is_premium(&money, other).await);
    fake.lock().unwrap().answer = json!({"entitled": true});
    assert!(!is_premium(&money, USER).await, "denial is still cached");
    money.refresh_grants(USER);
    assert!(
        is_premium(&money, USER).await,
        "confirmed Money grant is immediate"
    );
    assert!(
        !is_premium(&money, other).await,
        "another account keeps its cache"
    );
    assert_eq!(fake.lock().unwrap().checks.len(), 3);

    fake.lock().unwrap().answer = json!({"entitled": false});
    money.refresh_grants(USER);
    assert!(
        !is_premium(&money, USER).await,
        "refresh itself grants nothing"
    );
    fake.lock().unwrap().status = 503;
    money.refresh_grants(USER);
    assert!(
        !is_premium(&money, USER).await,
        "failed refresh never invents Plus"
    );
}
