use std::time::Duration;

use serde_json::json;

use super::super::checkout::{safe_return_to, session_body, Consent};
use super::super::Money;
use super::{catalog_fixture, fake_money, parsed, USER};

#[tokio::test]
async fn checkout_binds_full_split_or_denied_signal_snapshots_to_events() {
    use super::super::checkout_attribution::CheckoutAttribution;
    use base64::{engine::general_purpose::URL_SAFE_NO_PAD, Engine as _};
    let (money, fake) = fake_money(200, json!({"entitled": false})).await;
    let money = money.with_publishable_key("sylphx_pk_local_fixture");
    let catalog = parsed(catalog_fixture(&[]));
    let consent = Consent::for_plan(false, false).unwrap();
    let full = "granted,granted,granted,granted";
    let analytics = "granted,denied,denied,denied";
    for (snapshot, gpc, duplicate) in [
        (Some(full), false, false),
        (Some(analytics), false, false),
        (Some("denied,denied,denied,denied"), false, false),
        (None, false, false),
        (Some(full), true, false),
        (Some(full), false, true),
        (Some("denied,granted,granted,granted"), false, false),
    ] {
        let mut headers = axum::http::HeaderMap::new();
        headers.insert(
            "x-puzzled-entry-surface",
            "seo_vs-nyt-games".parse().unwrap(),
        );
        headers.insert(
            "cookie",
            "puzzled_attr=s%3Dlegacy%26g%3Dlegacy; _ga=GA1.1.88.99"
                .parse()
                .unwrap(),
        );
        headers.insert(
            "referer",
            "https://tryit.fun/private?secret=never-forwarded"
                .parse()
                .unwrap(),
        );
        let fields = json!({"ga_client_id":"12345.67890", "ga_session_id":"1234567890", "gclid":"test_g", "gbraid":"test_gb", "wbraid":"test_wb", "fbc":"fb.1.1234567890.test_fb", "fbp":"fb.1.1234567890.111", "utm_source":"google", "utm_id":"campaign-2", "utm_term":"private@example.test", "unknown":"never-forwarded"});
        headers.insert(
            "x-puzzled-signal-attribution",
            URL_SAFE_NO_PAD.encode(fields.to_string()).parse().unwrap(),
        );
        if let Some(snapshot) = snapshot {
            headers.insert("x-puzzled-signal-consent", snapshot.parse().unwrap());
        }
        if duplicate {
            headers.append("x-puzzled-signal-consent", full.parse().unwrap());
        }
        if gpc {
            headers.insert("sec-gpc", "0, 1".parse().unwrap());
        }
        let measurement = CheckoutAttribution::from_headers(&headers);
        let stored = puzzled_core::attribution::Attribution::from_cookie("s=stored&g=stored_ad");
        let tags = measurement.money_tags(stored);
        let result = super::super::checkout::create_guest_session(
            &money,
            &catalog,
            "individual_monthly",
            "en-US",
            "USD",
            tags.as_ref(),
            None,
            consent,
            measurement,
        )
        .await
        .unwrap();
        assert_eq!(result.created.url, "https://checkout.example/pay/cs_1");
    }
    tokio::time::timeout(Duration::from_secs(3), async {
        while fake.lock().unwrap().signals.len() < 2 {
            tokio::time::sleep(Duration::from_millis(5)).await;
        }
    })
    .await
    .unwrap();
    let fake = fake.lock().unwrap();
    assert_eq!(fake.signals.len(), 2);
    for batch in &fake.signals {
        assert_eq!(batch["consent"], "granted");
        let event = &batch["events"][0];
        assert_eq!(event["event_name"], "checkout_started");
        assert_eq!(
            event["properties"],
            json!({"entry_surface": "seo_vs-nyt-games"})
        );
        assert!(!event.to_string().contains("chk_1"));
    }
    assert_eq!(
        fake.signals[0]["events"][0]["event_id"],
        fake.signals[1]["events"][0]["event_id"]
    );
    let dims = |i: usize| &fake.sessions[i]["metadata"];
    assert_eq!(dims(0)["entry_surface"], "seo_vs-nyt-games");
    assert_eq!(dims(0)["utm_source"], "stored");
    assert_eq!(dims(0)["gclid"], "test_g");
    assert_eq!(dims(1)["utm_source"], "stored");
    assert!(dims(1).get("gclid").is_none());
    for index in 2..7 {
        assert!(dims(index).get("entry_surface").is_none());
        assert!(dims(index).get("gclid").is_none());
        assert!(dims(index).get("utm_source").is_none());
    }
    assert!(!fake
        .sessions
        .iter()
        .any(|body| body.to_string().contains("12345.67890")));
    let snapshot = |ga, ad| json!({"analytics_storage": ga, "ad_storage": ad, "ad_user_data": ad, "ad_personalization": ad});
    assert_eq!(
        fake.bindings[0],
        json!({
            "checkout_session_id": "chk_1", "consent":snapshot("granted", "granted"),
            "ga_client_id": "12345.67890", "ga_session_id":"1234567890",
            "gclid":"test_g", "gbraid":"test_gb", "wbraid":"test_wb", "fbc":"fb.1.1234567890.test_fb", "fbp":"fb.1.1234567890.111",
            "page_location": "https://puzzled.test/pricing?utm_source=google&utm_id=campaign-2"
        })
    );
    assert_eq!(
        fake.bindings[1],
        json!({
            "checkout_session_id": "chk_1", "consent":snapshot("granted", "denied"),
            "ga_client_id": "12345.67890", "ga_session_id":"1234567890",
            "page_location": "https://puzzled.test/pricing?utm_source=google&utm_id=campaign-2"
        })
    );
    assert_eq!(fake.bindings.len(), 7);
    for binding in &fake.bindings[2..] {
        assert_eq!(
            *binding,
            json!({"checkout_session_id":"chk_1","consent":snapshot("denied", "denied")})
        );
    }
}

#[test]
fn session_body_carries_the_click_id_in_metadata() {
    let money = Money::new("http://x/env", "k", "https://puzzled.test/");
    let tags = puzzled_core::attribution::Attribution {
        gclid: Some("Cj0KCQ_abc-1".into()),
        ..Default::default()
    };
    let body = session_body(
        &money,
        USER,
        "individual_monthly",
        "k_solo_m",
        "",
        None,
        Some(&tags),
        None,
        Consent::RecurringSubscription,
    );
    assert_eq!(body["metadata"]["gclid"], "Cj0KCQ_abc-1");
    assert!(body.get("client_reference_id").is_none());
    let none = session_body(
        &money,
        USER,
        "individual_monthly",
        "k_solo_m",
        "",
        None,
        None,
        None,
        Consent::RecurringSubscription,
    );
    assert!(none["metadata"].get("gclid").is_none());
}

#[test]
fn session_body_carries_attribution() {
    let money = Money::new("http://x/env", "k", "https://puzzled.test/");
    let tags = puzzled_core::attribution::Attribution {
        source: Some("tryit".into()),
        referral: Some("res_1".into()),
        ..Default::default()
    };
    let body = session_body(
        &money,
        USER,
        "individual_monthly",
        "k_solo_m",
        "",
        None,
        Some(&tags),
        Some("/games/sudoku?mode=archive&date=2026-11-10"),
        Consent::RecurringSubscription,
    );
    assert_eq!(body["metadata"]["utm_source"], "tryit");
    assert_eq!(body["metadata"]["ref"], "res_1");
    assert_eq!(
        body["success_url"],
        "https://puzzled.test/settings/subscription?checkout=success&s={CHECKOUT_SESSION_ID}&callbackUrl=%2Fgames%2Fsudoku%3Fmode%3Darchive%26date%3D2026-11-10"
    );
    assert_eq!(
        body["cancel_url"],
        "https://puzzled.test/pricing?checkout=cancelled&callbackUrl=%2Fgames%2Fsudoku%3Fmode%3Darchive%26date%3D2026-11-10"
    );
    assert_eq!(safe_return_to("//evil.example"), None);
    assert_eq!(safe_return_to("https://evil.example/a"), None);
    assert_eq!(
        safe_return_to("/games/sudoku").as_deref(),
        Some("/games/sudoku")
    );
}
