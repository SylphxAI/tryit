use serde_json::json;

use super::super::checkout::{create_session, session_body, CheckoutError, Consent};
use super::super::Money;
use super::{catalog_fixture, fake_money, granted, parsed, USER};

#[tokio::test]
async fn checkout_creates_a_money_session_and_returns_its_url() {
    let (money, fake) = fake_money(200, json!({"entitled": false})).await;
    let catalog = parsed(catalog_fixture(&[]));
    let consent = Consent::for_plan(false, false).unwrap();
    let url = create_session(
        &money,
        &catalog,
        USER,
        "individual_monthly",
        "en-GB",
        "gbp",
        None,
        None,
        consent,
        Default::default(),
        None,
    )
    .await
    .unwrap();
    assert_eq!(url, "https://checkout.example/pay/cs_1");
    let body = fake.lock().unwrap().sessions[0].clone();
    assert_eq!(body["subject"]["end_user"], USER);
    assert_eq!(body["line_items"][0]["price"], "k_solo_m");
    assert_eq!(body["currency_code"], "GBP");
    assert_eq!(body["metadata"]["plan_id"], "individual_monthly");
    assert_eq!(body["metadata"]["immediate_supply_consent"], "false");
    assert_eq!(body["metadata"]["cancellation_regime"], "uk_ccr_reg_36");
    assert_eq!(body["locale"], "en-GB");
    assert_eq!(
        body["success_url"],
        "https://puzzled.test/en-GB/settings/subscription?checkout=success&s={CHECKOUT_SESSION_ID}"
    );
    assert_eq!(
        body["cancel_url"],
        "https://puzzled.test/en-GB/pricing?checkout=cancelled"
    );
}

#[tokio::test]
async fn one_time_pass_requires_reg37_waiver_while_recurring_uses_reg36() {
    let mut value = catalog_fixture(&[]);
    value["spec"]["products"]
        .as_array_mut()
        .unwrap()
        .push(json!({
            "key": "weekend",
            "features": {"plus": "true", "seats": "1"},
            "licence": {
                "scheme": "sylphx-offline-ed25519-v1",
                "plan": "plus",
                "token_product": "puzzled",
                "key": "plus-key",
                "term": {"unit": "days", "count": 3}
            },
            "prices": [{"key": "weekend_once", "unit_amounts": {"USD": "299", "GBP": "299"}}]
        }));
    let catalog = parsed(value);
    let (money, fake) = fake_money(200, json!({"entitled": false})).await;

    // One-off 3-Day Pass refuses checkout without explicit Reg 37 waiver.
    assert_eq!(
        create_session(
            &money,
            &catalog,
            USER,
            "individual_once",
            "en-GB",
            "gbp",
            None,
            None,
            Consent::RecurringSubscription,
            Default::default(),
            None,
        )
        .await,
        Err(CheckoutError::ConsentRequired)
    );
    assert!(fake.lock().unwrap().sessions.is_empty());

    // One-off 3-Day Pass succeeds with Reg 37 waiver and stamps reg_37 metadata.
    let waiver = Consent::for_plan(true, true).unwrap();
    create_session(
        &money,
        &catalog,
        USER,
        "individual_once",
        "en-GB",
        "gbp",
        None,
        None,
        waiver,
        Default::default(),
        None,
    )
    .await
    .unwrap();
    let pass_body = fake.lock().unwrap().sessions[0].clone();
    assert_eq!(pass_body["metadata"]["plan_id"], "individual_once");
    assert_eq!(pass_body["metadata"]["immediate_supply_consent"], "true");
    assert_eq!(
        pass_body["metadata"]["cancellation_regime"],
        "uk_ccr_reg_37"
    );
}

#[tokio::test]
async fn checkout_drops_a_currency_money_does_not_price() {
    let (money, fake) = fake_money(200, json!({"entitled": false})).await;
    let catalog = parsed(catalog_fixture(&[]));
    let consent = Consent::for_plan(false, false).unwrap();
    create_session(
        &money,
        &catalog,
        USER,
        "family_yearly",
        "",
        "jpy",
        None,
        None,
        consent,
        Default::default(),
        None,
    )
    .await
    .unwrap();
    let body = fake.lock().unwrap().sessions[0].clone();
    assert!(body.get("currency_code").is_none());
    assert!(body.get("locale").is_none());
}

#[test]
fn no_consent_no_checkout() {
    // One-off pass (Reg 37) requires explicit 14-day waiver consent.
    assert_eq!(
        Consent::for_plan(true, false).unwrap_err(),
        CheckoutError::ConsentRequired
    );
    assert_eq!(
        Consent::for_plan(true, true).unwrap(),
        Consent::OneOffDigitalWaiver
    );
    // Recurring subscriptions (Reg 36) never require the 14-day digital-content waiver.
    assert_eq!(
        Consent::for_plan(false, false).unwrap(),
        Consent::RecurringSubscription
    );
    assert_eq!(
        Consent::for_plan(false, true).unwrap(),
        Consent::RecurringSubscription
    );
}

#[tokio::test]
async fn checkout_refuses_unknown_archived_and_already_subscribed() {
    let consent = Consent::for_plan(false, false).unwrap();
    let (money, fake) = fake_money(200, json!({"entitled": false})).await;
    let catalog = parsed(catalog_fixture(&[]));
    assert_eq!(
        create_session(
            &money,
            &catalog,
            USER,
            "nope",
            "",
            "usd",
            None,
            None,
            consent,
            Default::default(),
            None,
        )
        .await,
        Err(CheckoutError::PlanNotOnSale)
    );
    let archived = parsed(catalog_fixture(&["k_solo_m"]));
    assert_eq!(
        create_session(
            &money,
            &archived,
            USER,
            "individual_monthly",
            "",
            "usd",
            None,
            None,
            consent,
            Default::default(),
            None,
        )
        .await,
        Err(CheckoutError::PlanNotOnSale)
    );
    assert!(fake.lock().unwrap().sessions.is_empty());
    let (money, fake) = fake_money(200, granted()).await;
    assert_eq!(
        create_session(
            &money,
            &catalog,
            USER,
            "individual_monthly",
            "",
            "usd",
            None,
            None,
            consent,
            Default::default(),
            None,
        )
        .await,
        Err(CheckoutError::AlreadySubscribed)
    );
    assert!(fake.lock().unwrap().sessions.is_empty());
}

#[test]
fn session_body_sends_only_locales_stripe_accepts() {
    let money = Money::new("http://x/env", "k", "https://puzzled.test/");
    let locale_of = |locale: &str| {
        session_body(
            &money,
            USER,
            "individual_monthly",
            "k_solo_m",
            locale,
            None,
            None,
            None,
            Consent::RecurringSubscription,
        )
        .get("locale")
        .and_then(|v| v.as_str().map(str::to_string))
    };
    // Every locale Puzzled ships maps onto Stripe's list; en-US was refused.
    assert_eq!(locale_of("en-US").as_deref(), Some("en"));
    assert_eq!(locale_of("en-GB").as_deref(), Some("en-GB"));
    assert_eq!(locale_of("zh-HK").as_deref(), Some("zh-HK"));
    assert_eq!(locale_of("zh-TW").as_deref(), Some("zh-TW"));
    assert_eq!(locale_of("zh-CN").as_deref(), Some("zh"));
    assert_eq!(locale_of("xx-YY").as_deref(), Some("auto"));
    assert_eq!(locale_of(""), None);
}

#[tokio::test]
async fn consent_is_recorded_once_per_checkout() {
    let Some(pool) = crate::test_support::fresh_database().await else {
        return;
    };
    super::super::consent_db::record(
        &pool,
        USER,
        "individual_monthly",
        "k_solo_m",
        "en-US",
        false,
    )
    .await
    .unwrap();
    let (n, statement): (i64, String) = sqlx::query_as(
        r#"SELECT count(*), max("statement") FROM "checkout_consents" WHERE "user_id" = $1::uuid AND "plan_id" = 'individual_monthly'"#,
    )
    .bind(USER)
    .fetch_one(&pool)
    .await
    .unwrap();
    assert_eq!(n, 1);
    assert_eq!(
        statement,
        super::super::consent_db::RECURRING_SUPPLY_STATEMENT
    );

    super::super::consent_db::record(
        &pool,
        USER,
        "individual_once",
        "puzzled_starter_unlock",
        "en-US",
        true,
    )
    .await
    .unwrap();
    let (pass_n, pass_statement): (i64, String) = sqlx::query_as(
        r#"SELECT count(*), max("statement") FROM "checkout_consents" WHERE "user_id" = $1::uuid AND "plan_id" = 'individual_once'"#,
    )
    .bind(USER)
    .fetch_one(&pool)
    .await
    .unwrap();
    assert_eq!(pass_n, 1);
    assert_eq!(
        pass_statement,
        super::super::consent_db::IMMEDIATE_SUPPLY_STATEMENT
    );
}
