use std::sync::{Arc, Mutex};

use axum::http::StatusCode;
use axum::routing::{get, post};
use axum::{Json, Router};
use serde_json::{json, Value};

use super::super::access::is_premium;
use super::super::checkout::Consent;
use super::super::Money;
use super::{catalog_fixture, USER};

#[test]
fn guest_session_body_omits_subject_and_preserves_consent_and_attribution() {
    let money = Money::new(
        "https://api.example/v1/orgs/o/projects/p/envs/e",
        "sk_test",
        "https://tryit.fun",
    );
    let attr = puzzled_core::attribution::Attribution::from_cookie("s=google&m=cpc&g=Cj0_guest");
    let body = super::super::checkout::guest_session_body(
        &money,
        "individual_yearly",
        "plus_individual_yearly",
        "ja",
        Some("jpy"),
        attr.as_ref(),
        Some("/games/sudoku"),
        Consent::RecurringSubscription,
    );
    assert!(
        body.get("subject").is_none(),
        "guest checkout must omit subject"
    );
    assert_eq!(body["line_items"][0]["price"], "plus_individual_yearly");
    assert_eq!(body["locale"], "ja");
    assert_eq!(body["currency_code"], "JPY");
    assert_eq!(body["metadata"]["plan_id"], "individual_yearly");
    assert_eq!(body["metadata"]["immediate_supply_consent"], "false");
    assert_eq!(body["metadata"]["cancellation_regime"], "uk_ccr_reg_36");
    assert_eq!(body["metadata"]["utm_source"], "google");
    assert_eq!(body["metadata"]["gclid"], "Cj0_guest");
    let success = body["success_url"].as_str().unwrap();
    assert_eq!(
        success,
        "https://tryit.fun/ja/settings/subscription?checkout=success&s={CHECKOUT_SESSION_ID}&callbackUrl=%2Fgames%2Fsudoku"
    );
    assert!(
        !success.contains("clm_"),
        "claim_secret never enters return URLs"
    );
}

#[test]
fn claim_cookie_roundtrips_bounds_entries_and_redacts_debug() {
    use super::super::claim_cookie::{
        append_entry, find_entry, format_set_cookie, read_entries, remove_entry, ClaimCookieEntry,
        CHECKOUT_CLAIM_COOKIE,
    };
    let entry = ClaimCookieEntry {
        s: "cs_test_1".into(),
        chk: "chk_1".into(),
        sec: "clm_super_secret_value".into(),
        plan: "individual_yearly".into(),
        price: "plus_individual_yearly".into(),
        loc: "en-US".into(),
    };
    let debug_str = format!("{entry:?}");
    assert!(!debug_str.contains("clm_super_secret_value"));
    assert!(debug_str.contains("[redacted]"));

    let entries = append_entry(Vec::new(), entry);
    let set_cookie = format_set_cookie(&entries, true).unwrap();
    assert!(set_cookie.starts_with(&format!("{CHECKOUT_CLAIM_COOKIE}=")));
    assert!(set_cookie.contains("HttpOnly"));
    assert!(set_cookie.contains("SameSite=Lax"));
    assert!(set_cookie.contains("Secure"));
    assert!(!set_cookie.contains("clm_super_secret_value"));

    let cookie_pair = set_cookie.split(';').next().unwrap();
    let mut headers = axum::http::HeaderMap::new();
    headers.insert(axum::http::header::COOKIE, cookie_pair.parse().unwrap());
    let decoded = read_entries(&headers);
    assert_eq!(decoded.len(), 1);
    assert_eq!(
        find_entry(&decoded, "cs_test_1").unwrap().sec,
        "clm_super_secret_value"
    );
    assert_eq!(
        find_entry(&decoded, "chk_1").unwrap().sec,
        "clm_super_secret_value"
    );

    let after_remove = remove_entry(decoded, "cs_test_1");
    assert!(after_remove.is_empty());
    let cleared = format_set_cookie(&after_remove, true).unwrap();
    assert!(cleared.contains("Max-Age=0"));
}

#[tokio::test]
async fn guest_checkout_and_claim_work_in_both_webhook_orderings_and_verified_email_fallback() {
    #[derive(Default)]
    struct GuestState {
        owner: Option<String>,
        webhook_landed: bool,
        expected_secret: String,
        server_claims: Vec<Value>,
        client_claims: Vec<(String, String, Value)>,
    }

    let state = Arc::new(Mutex::new(GuestState {
        expected_secret: "clm_secret_token_123".into(),
        ..Default::default()
    }));
    let s_create = state.clone();
    let s_server_claim = state.clone();
    let s_client_claim = state.clone();
    let s_check = state.clone();

    let app = Router::new()
        .route(
            "/v1/orgs/o/projects/p/envs/e/price_catalogs/default",
            get(|| async { Json(catalog_fixture(&[])) }),
        )
        .route(
            "/v1/orgs/o/projects/p/envs/e/checkout_sessions",
            post(move |Json(body): Json<Value>| {
                let s = s_create.clone();
                async move {
                    assert!(body.get("subject").is_none());
                    let mut guard = s.lock().unwrap();
                    guard.owner = Some("guest:chk_g1".into());
                    Json(json!({
                        "name": "orgs/o/projects/p/envs/e/checkout_sessions/chk_g1",
                        "url": "https://checkout.stripe.com/c/pay/cs_guest_1",
                        "state": "open",
                        "processor_session_id": "cs_guest_1",
                        "guest": true,
                        "claimed": false,
                        "claim_secret": guard.expected_secret,
                        "claim_secret_expires_at": "2099-01-01T00:00:00Z"
                    }))
                }
            }),
        )
        .route(
            "/v1/orgs/o/projects/p/envs/e/checkout_sessions/{id}",
            post(
                move |axum::extract::Path(id): axum::extract::Path<String>,
                      Json(body): Json<Value>| {
                    let s = s_server_claim.clone();
                    async move {
                        let Some(lookup) = id.strip_suffix(":claim") else {
                            return (StatusCode::NOT_FOUND, Json(json!({"code": "NOT_FOUND"})));
                        };
                        assert_eq!(lookup, "cs_guest_1");
                        let mut guard = s.lock().unwrap();
                        guard.server_claims.push(body.clone());
                        if body["claim_secret"].as_str() != Some(guard.expected_secret.as_str()) {
                            return (
                                StatusCode::FORBIDDEN,
                                Json(json!({
                                    "code": "PERMISSION_DENIED",
                                    "detail": "bad secret clm_secret_token_123",
                                    "details": [{"reason": "claim_secret_invalid"}]
                                })),
                            );
                        }
                        let target = body["subject"]["end_user"].as_str().unwrap().to_string();
                        guard.owner = Some(target.clone());
                        (
                            StatusCode::OK,
                            Json(json!({
                                "name": "orgs/o/projects/p/envs/e/checkout_sessions/chk_g1",
                                "subject": {"end_user": target},
                                "guest": true,
                                "claimed": true,
                                "metadata": {"plan_id": "individual_yearly"}
                            })),
                        )
                    }
                },
            ),
        )
        .route(
            "/v1/money/orgs/o/projects/p/envs/e/checkout_sessions/{id}",
            post(
                move |axum::extract::Path(id): axum::extract::Path<String>,
                      headers: axum::http::HeaderMap,
                      Json(body): Json<Value>| {
                    let s = s_client_claim.clone();
                    async move {
                        let Some(_lookup) = id.strip_suffix(":claim") else {
                            return (StatusCode::NOT_FOUND, Json(json!({"code": "NOT_FOUND"})));
                        };
                        let pk = headers
                            .get("x-sylphx-key")
                            .and_then(|v| v.to_str().ok())
                            .unwrap_or_default()
                            .to_string();
                        let auth = headers
                            .get("authorization")
                            .and_then(|v| v.to_str().ok())
                            .unwrap_or_default()
                            .to_string();
                        let mut guard = s.lock().unwrap();
                        guard.client_claims.push((pk, auth, body));
                        guard.owner = Some("usr_01verifiedemailuser0000001".into());
                        (
                            StatusCode::OK,
                            Json(json!({
                                "name": "orgs/o/projects/p/envs/e/checkout_sessions/chk_g1",
                                "subject": {"end_user": "usr_01verifiedemailuser0000001"},
                                "guest": true,
                                "claimed": true,
                                "claim_method": "verified_email"
                            })),
                        )
                    }
                },
            ),
        )
        .route(
            "/v1/orgs/o/projects/p/envs/e/entitlement_grants:check",
            post(move |Json(body): Json<Value>| {
                let s = s_check.clone();
                async move {
                    let guard = s.lock().unwrap();
                    let asked = body["subject"]["end_user"].as_str().unwrap_or_default();
                    let entitled = guard.webhook_landed && guard.owner.as_deref() == Some(asked);
                    Json(json!({"entitled": entitled}))
                }
            }),
        );

    let listener = tokio::net::TcpListener::bind("127.0.0.1:0").await.unwrap();
    let addr = listener.local_addr().unwrap();
    tokio::spawn(async move { axum::serve(listener, app).await.unwrap() });

    let money = Money::new(
        &format!("http://{addr}/v1/orgs/o/projects/p/envs/e"),
        "sk_money",
        "https://tryit.fun",
    )
    .with_publishable_key("pk_test_1");
    let catalog = money.catalog().await.unwrap();

    // 1. Cold-guest checkout omits subject and returns claim_secret.
    let guest = super::super::checkout::create_guest_session(
        &money,
        &catalog,
        "individual_yearly",
        "en-US",
        "usd",
        None,
        None,
        Consent::for_plan(false, false).unwrap(),
        Default::default(),
    )
    .await
    .unwrap();
    assert_eq!(
        guest.created.url,
        "https://checkout.stripe.com/c/pay/cs_guest_1"
    );
    assert_eq!(guest.created.session_id, "chk_g1");
    assert_eq!(guest.created.processor_session_id, "cs_guest_1");
    assert_eq!(
        guest.created.claim_secret.as_deref(),
        Some("clm_secret_token_123")
    );

    // Wrong secret is refused and clm_ token is redacted in MoneyError Display.
    let bad = money
        .claim_checkout_session("cs_guest_1", USER, Some("clm_wrong"), None)
        .await
        .unwrap_err();
    assert!(!bad.to_string().contains("clm_secret_token_123"));

    // 2. Ordering A: Claim-before-webhook -> rebinds owner first, then webhook lands.
    assert!(!is_premium(&money, USER).await);
    let claimed = money
        .claim_checkout_session(
            "cs_guest_1",
            USER,
            guest.created.claim_secret.as_deref(),
            None,
        )
        .await
        .unwrap();
    assert_eq!(claimed.subject_end_user, USER);
    assert_eq!(claimed.plan_id.as_deref(), Some("individual_yearly"));
    assert!(
        !is_premium(&money, USER).await,
        "webhook has not arrived yet"
    );
    state.lock().unwrap().webhook_landed = true;
    money.refresh_grants(USER);
    assert!(
        is_premium(&money, USER).await,
        "once webhook lands on rebound subject, USER is entitled"
    );

    // 3. Ordering B: Webhook-before-claim (with cached denial before claim).
    let user_b = "0190a0a0-0000-7000-8000-000000000099";
    state.lock().unwrap().owner = Some("guest:chk_g1".into());
    state.lock().unwrap().webhook_landed = true;
    assert!(
        !is_premium(&money, user_b).await,
        "denial cached before claim"
    );
    money
        .claim_checkout_session("cs_guest_1", user_b, Some("clm_secret_token_123"), None)
        .await
        .unwrap();
    assert!(
        is_premium(&money, user_b).await,
        "claim invalidates grant cache so entitlement is immediate"
    );

    // 4. Verified-email fallback when cookie secret is absent.
    let claimed_email = money
        .claim_checkout_session(
            "cs_guest_1",
            user_b,
            None,
            Some("identity_org_session_live_abc"),
        )
        .await
        .unwrap();
    assert_eq!(
        claimed_email.subject_end_user,
        "usr_01verifiedemailuser0000001"
    );
    assert!(is_premium(&money, "usr_01verifiedemailuser0000001").await);
}
