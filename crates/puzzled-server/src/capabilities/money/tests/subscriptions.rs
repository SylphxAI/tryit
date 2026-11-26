use serde_json::{json, Value};

use super::super::client::Subscription;
use super::super::Money;
use super::{fake_money, USER};

fn sub(user: &str, status: &str, ends: bool) -> Value {
    json!({"name": "orgs/o/projects/p/envs/e/customer_subscriptions/csb_1",
           "subject": {"end_user": user}, "status": status, "cancel_at_period_end": ends,
           "current_period_end_time": "2099-01-01T00:00:00Z",
           "items": [{"price": "k_solo_m", "quantity": 1}]})
}

#[tokio::test]
async fn erasure_guard_sees_a_renewing_money_subscription() {
    let (money, _) = fake_money(
        200,
        json!({"customer_subscriptions": [sub(USER, "active", false)]}),
    )
    .await;
    assert_eq!(money.has_renewing_subscription(USER).await, Ok(true));
}

#[tokio::test]
async fn erasure_guard_ignores_ended_cancelled_and_other_peoples_subscriptions() {
    let rows = json!({"customer_subscriptions": [
        sub(USER, "active", true),
        sub(USER, "canceled", false),
        sub("someone-else", "active", false)]});
    let (money, _) = fake_money(200, rows).await;
    assert_eq!(money.has_renewing_subscription(USER).await, Ok(false));
    let (money, _) = fake_money(200, json!({})).await;
    assert_eq!(money.has_renewing_subscription(USER).await, Ok(false));
}

#[tokio::test]
async fn erasure_guard_fails_closed_on_every_status_not_known_to_be_over() {
    for status in [
        "past_due",
        "incomplete",
        "unpaid",
        "paused",
        "some_future_status",
        "",
    ] {
        let (money, _) = fake_money(
            200,
            json!({"customer_subscriptions": [sub(USER, status, false)]}),
        )
        .await;
        assert_eq!(
            money.has_renewing_subscription(USER).await,
            Ok(true),
            "status {status:?}"
        );
    }
    for status in ["canceled", "incomplete_expired", "expired"] {
        let (money, _) = fake_money(
            200,
            json!({"customer_subscriptions": [sub(USER, status, false)]}),
        )
        .await;
        assert_eq!(
            money.has_renewing_subscription(USER).await,
            Ok(false),
            "status {status:?}"
        );
    }
    let (money, _) = fake_money(
        200,
        json!({"customer_subscriptions": [sub(USER, "some_future_status", true)]}),
    )
    .await;
    assert_eq!(money.has_renewing_subscription(USER).await, Ok(false));
}

#[test]
fn entitlement_live_is_unchanged_by_the_erasure_rule() {
    let s = Subscription {
        id: "x".into(),
        status: "some_future_status".into(),
        cancel_at_period_end: false,
        current_period_end: None,
        trial_end: None,
        price_keys: vec![],
    };
    assert!(!s.live() && !s.renews() && s.renews_for_erasure());
}

#[tokio::test]
async fn erasure_guard_errors_when_money_is_unavailable() {
    let (money, _) = fake_money(503, json!({})).await;
    assert!(money.has_renewing_subscription(USER).await.is_err());
    let gone = Money::new("http://127.0.0.1:1/env", "sk_test", "https://puzzled.test");
    assert!(gone.has_renewing_subscription(USER).await.is_err());
}

#[tokio::test]
async fn subscriptions_are_read_with_their_period_and_prices() {
    let (money, _) = fake_money(
        200,
        json!({"customer_subscriptions": [sub(USER, "active", false)]}),
    )
    .await;
    let subs = money.subscriptions(USER).await.unwrap();
    assert_eq!(subs.len(), 1);
    assert_eq!(subs[0].id, "csb_1");
    assert!(subs[0].live() && subs[0].renews());
    assert_eq!(subs[0].price_keys, ["k_solo_m"]);
    assert_eq!(
        subs[0].current_period_end.unwrap().timestamp(),
        4_070_908_800_i64
    );
}

#[tokio::test]
async fn a_trialing_subscription_is_read_with_its_trial_end() {
    let mut row = sub(USER, "trialing", false);
    row["trial_end_time"] = json!("2098-12-29T00:00:00Z");
    let (money, _) = fake_money(200, json!({"customer_subscriptions": [row]})).await;
    let subs = money.subscriptions(USER).await.unwrap();
    assert_eq!(subs[0].trial_end.unwrap().timestamp(), 4_070_649_600_i64);
    assert_eq!(
        subs[0].current_period_end.unwrap().timestamp(),
        4_070_908_800_i64
    );
    // No trial: none is invented from the period end.
    let (money, _) = fake_money(
        200,
        json!({"customer_subscriptions": [sub(USER, "active", false)]}),
    )
    .await;
    assert_eq!(money.subscriptions(USER).await.unwrap()[0].trial_end, None);
}

#[tokio::test]
async fn cancel_ends_at_the_period_end_with_no_refund_and_resume_undoes_it() {
    let (money, fake) = fake_money(200, json!({})).await;
    money.cancel_at_period_end("csb_1").await.unwrap();
    money.resume("csb_1").await.unwrap();
    let actions = fake.lock().unwrap().actions.clone();
    assert_eq!(actions[0], r#"csb_1:cancel {"at_period_end":true}"#);
    assert!(!actions[0].contains("refund"));
    assert_eq!(actions[1], "csb_1:resume {}");
    // An id cannot escape its path segment.
    money.cancel_at_period_end("../x").await.unwrap();
    assert!(fake.lock().unwrap().actions[2].starts_with("x:cancel"));
}

#[tokio::test]
async fn portal_session_url_comes_from_money() {
    let (money, fake) = fake_money(200, json!({})).await;
    let url = money
        .portal_url(USER, "https://puzzled.test/settings/subscription")
        .await
        .unwrap();
    assert_eq!(url, "https://portal.example/p/1");
    assert!(fake.lock().unwrap().actions[0].contains(USER));
    let (down, _) = fake_money(503, json!({})).await;
    assert!(down.portal_url(USER, "https://x").await.is_err());
}

#[tokio::test]
async fn a_subscription_row_with_omitted_fields_is_read_not_dropped() {
    let row = json!({"name": "orgs/o/projects/p/envs/e/customer_subscriptions/csb_1",
                     "subject": {"end_user": USER}});
    let (money, _) = fake_money(200, json!({"customer_subscriptions": [row]})).await;
    let subs = money.subscriptions(USER).await.unwrap();
    assert_eq!(subs.len(), 1);
    assert!(!subs[0].cancel_at_period_end, "an omitted false is false");
    assert!(!subs[0].live());
    assert_eq!(money.has_renewing_subscription(USER).await, Ok(true));
}
