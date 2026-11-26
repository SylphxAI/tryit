#![allow(clippy::expect_used, clippy::unwrap_used)]

use std::time::Duration;

use axum::http::{header, HeaderMap, HeaderValue, StatusCode};
use jsonwebtoken::{encode, Algorithm, EncodingKey, Header as JwtHeader};
use serde::Serialize;

use super::jwks::{fetch_jwks, jwks_cache_from_document, JwksDocument};
use super::verify::{validation_config_inner, verify_with_jwks};
use super::{resolve_verified_identity, verify_platform_jwt, JwtError};

const TEST_PUB_PEM: &str = include_str!("../../../../../testdata/platform_jwt_test_pub.pem");
const TEST_PRIV_PEM: &str = include_str!("../../../../../testdata/platform_jwt_test_priv.pem");

#[derive(Serialize)]
struct MintClaims {
    sub: String,
    name: String,
    exp: i64,
}

fn mint_token(sub: &str) -> String {
    let claims = MintClaims {
        sub: sub.to_string(),
        name: "Test User".to_string(),
        exp: chrono::Utc::now().timestamp() + 3600,
    };
    let key = EncodingKey::from_rsa_pem(TEST_PRIV_PEM.as_bytes()).expect("enc key");
    encode(&JwtHeader::new(Algorithm::RS256), &claims, &key).expect("mint")
}

#[test]
fn rejects_missing_bearer() {
    let h = HeaderMap::new();
    let err = resolve_verified_identity(&h).unwrap_err();
    assert_eq!(err, JwtError::MissingBearer);
}

#[test]
fn rejects_x_user_id_without_jwt() {
    let mut h = HeaderMap::new();
    h.insert("x-user-id", HeaderValue::from_static("attacker"));
    let err = resolve_verified_identity(&h).unwrap_err();
    assert_eq!(err, JwtError::MissingBearer);
}

#[test]
fn verifies_rs256_and_extracts_sub() {
    let token = mint_token("user_01hxyz");
    let mut h = HeaderMap::new();
    h.insert(
        header::AUTHORIZATION,
        HeaderValue::from_str(&format!("Bearer {token}")).unwrap(),
    );
    let id = resolve_verified_identity(&h).expect("verified");
    assert_eq!(id.user_id, "user_01hxyz");
    assert_eq!(id.display_name.as_deref(), Some("Test User"));
}

#[test]
fn production_enforcement_requires_audience_and_issuer() {
    // Pure inner config check: no process-global env mutation, deterministic.
    assert!(matches!(
        validation_config_inner(None, None, true),
        Err(JwtError::JwksUnavailable(_))
    ));
    assert!(validation_config_inner(Some("puzzled".into()), Some("sylphx".into()), true,).is_ok());
    assert!(validation_config_inner(None, None, false).is_ok());
}

#[test]
fn act_or_actor_field_present_means_delegated_and_absent_does_not() {
    let key = EncodingKey::from_rsa_pem(TEST_PRIV_PEM.as_bytes()).expect("enc key");
    let exp = chrono::Utc::now().timestamp() + 3600;
    let identity = |extra: Option<(&str, serde_json::Value)>| {
        let mut claims = serde_json::json!({"sub": "user_a", "exp": exp});
        if let Some((k, v)) = extra {
            claims[k] = v;
        }
        let token = encode(&JwtHeader::new(Algorithm::RS256), &claims, &key).expect("mint");
        verify_platform_jwt(&token).expect("verify")
    };
    assert_eq!(identity(None).actor, None);
    for field in ["act", "actor"] {
        for value in [
            serde_json::json!(null),
            serde_json::json!(false),
            serde_json::json!(""),
            serde_json::json!({}),
        ] {
            let got = identity(Some((field, value.clone())));
            assert!(got.is_delegated(), "{field}={value}");
        }
    }
    assert_eq!(
        identity(Some(("act", serde_json::json!({"sub": "agent_1"}))))
            .actor
            .as_deref(),
        Some("agent_1")
    );
}

#[test]
fn rejects_string_typed_exp_claim() {
    let claims = serde_json::json!({
        "sub": "user_string_exp",
        "name": "Test User",
        "exp": "9999999999",
    });
    let key = EncodingKey::from_rsa_pem(TEST_PRIV_PEM.as_bytes()).expect("enc key");
    let token = encode(&JwtHeader::new(Algorithm::RS256), &claims, &key).expect("mint");
    let err = verify_platform_jwt(&token).unwrap_err();
    assert!(
        matches!(err, JwtError::VerificationFailed(_)),
        "string-typed exp must fail closed for GHSA-h395, got {err:?}"
    );
}

#[test]
fn unloaded_jwks_fails_closed_without_fetching_inline() {
    let refresh = tokio::sync::Notify::new();
    let token = {
        let claims = MintClaims {
            sub: "cold_start".into(),
            name: "Cold".into(),
            exp: chrono::Utc::now().timestamp() + 3600,
        };
        let enc = EncodingKey::from_rsa_pem(TEST_PRIV_PEM.as_bytes()).expect("enc");
        encode(&JwtHeader::new(Algorithm::RS256), &claims, &enc).expect("mint")
    };
    let err = verify_with_jwks(&token, None, &refresh).unwrap_err();
    assert!(matches!(err, JwtError::JwksUnavailable(_)), "got {err:?}");
    assert_eq!(err.status(), StatusCode::SERVICE_UNAVAILABLE);
}

#[test]
fn jwks_document_without_rsa_keys_is_rejected() {
    let doc: JwksDocument =
        serde_json::from_value(serde_json::json!({ "keys": [{ "kty": "EC", "kid": "k1" }] }))
            .expect("doc");
    assert!(matches!(
        jwks_cache_from_document(doc),
        Err(JwtError::JwksUnavailable(_))
    ));
}

#[test]
fn rejects_garbage_token() {
    let err = verify_platform_jwt("not-a-jwt").unwrap_err();
    assert_eq!(err, JwtError::MalformedToken);
}

const TEST_N: &str = "nHAYL32Ej3o2Ub7lyRntvTpe-rQi9GgfznwVv5MY5xawWwyEzfNPoPbcEO_RZ4tAloF-F0ZYq_LZzlSQdNeR4r3pkJUS9kl-3DF6D8dzzBcOpLx2g70Arw2gtL5qIPF43v8RsAlnjgacpwwDv_vzTb8K0dgNMbmdacduabkEVXuDj5zn6AVi_RmB5LcK5KyXxoNW0Lf1Day2St8gOZj_pH0MYE37Eaa105fYPmO8h-fV2yg00pbss1K1PvTbwspfS4AZD9vdleyXKFoBXHciM4vXgHn5GlFZJ1V5A_kVFc74xsWNHAH-M8tHR2u4-yxCYg4efdcWi68SAqqYUkfKIQ";

fn test_jwks(kid: &str, alg: Option<&str>) -> JwksDocument {
    let mut key = serde_json::json!({"kty": "RSA", "kid": kid, "n": TEST_N, "e": "AQAB"});
    if let Some(alg) = alg {
        key["alg"] = alg.into();
    }
    serde_json::from_value(serde_json::json!({ "keys": [key] })).expect("jwks doc")
}

fn mint_with_kid(kid: &str, sub: &str) -> String {
    let claims = MintClaims {
        sub: sub.into(),
        name: "Jwks".into(),
        exp: chrono::Utc::now().timestamp() + 3600,
    };
    let mut header = JwtHeader::new(Algorithm::RS256);
    header.kid = Some(kid.into());
    let enc = EncodingKey::from_rsa_pem(TEST_PRIV_PEM.as_bytes()).expect("enc");
    encode(&header, &claims, &enc).expect("mint")
}

/// Consume any pending early-refresh permit so a test starts from "none requested".
fn refresh_requested(refresh: &tokio::sync::Notify) -> bool {
    let rt = tokio::runtime::Builder::new_current_thread()
        .enable_time()
        .build()
        .expect("rt");
    rt.block_on(async {
        tokio::time::timeout(Duration::from_millis(20), refresh.notified())
            .await
            .is_ok()
    })
}

#[test]
fn token_verifies_against_jwks_key() {
    let refresh = tokio::sync::Notify::new();
    let cache = jwks_cache_from_document(test_jwks("k1", Some("RS256"))).expect("cache");
    let id = verify_with_jwks(&mint_with_kid("k1", "jwks_user"), Some(&cache), &refresh)
        .expect("verified");
    assert_eq!(id.user_id, "jwks_user");
    assert!(
        !refresh_requested(&refresh),
        "known kid must not trigger a refetch"
    );
}

#[test]
fn unknown_kid_requests_one_refetch() {
    let refresh = tokio::sync::Notify::new();
    let cache = jwks_cache_from_document(test_jwks("k1", None)).expect("cache");
    // Verifies via the fallback key scan, but the rotation signal must fire once.
    let id = verify_with_jwks(&mint_with_kid("rotated", "u"), Some(&cache), &refresh)
        .expect("fallback key");
    assert_eq!(id.user_id, "u");
    let id = verify_with_jwks(&mint_with_kid("rotated", "u"), Some(&cache), &refresh)
        .expect("fallback key");
    assert_eq!(id.user_id, "u");
    assert!(
        refresh_requested(&refresh),
        "unknown kid must request a refetch"
    );
    assert!(
        !refresh_requested(&refresh),
        "requests coalesce into one permit"
    );
}

#[test]
fn fetch_jwks_reads_document_over_http() {
    let body =
        serde_json::json!({"keys": [{"kty":"RSA","kid":"k1","n":TEST_N,"e":"AQAB"}]}).to_string();
    let rt = tokio::runtime::Builder::new_current_thread()
        .enable_all()
        .build()
        .expect("rt");
    let cache = rt.block_on(async {
        use tokio::io::{AsyncReadExt, AsyncWriteExt};
        let listener = tokio::net::TcpListener::bind("127.0.0.1:0").await.expect("bind");
        let addr = listener.local_addr().expect("addr");
        tokio::spawn(async move {
            let (mut sock, _) = listener.accept().await.expect("accept");
            let mut buf = [0u8; 1024];
            let _ = sock.read(&mut buf).await;
            let resp = format!(
                "HTTP/1.1 200 OK\r\ncontent-type: application/json\r\ncontent-length: {}\r\nconnection: close\r\n\r\n{}",
                body.len(),
                body
            );
            sock.write_all(resp.as_bytes()).await.expect("write");
        });
        fetch_jwks(&reqwest::Client::new(), &format!("http://{addr}/jwks.json"))
            .await
            .expect("fetch")
    });
    assert!(cache.keys.contains_key("k1"));
}

#[test]
fn jwk_declaring_other_algorithm_is_skipped() {
    assert!(matches!(
        jwks_cache_from_document(test_jwks("k1", Some("RS512"))),
        Err(JwtError::JwksUnavailable(_))
    ));
}

#[test]
fn env_pinned_key_is_ignored_in_production_path() {
    let refresh = tokio::sync::Notify::new();
    // SAFETY-free on edition 2021; guarded by the shared test lock.
    std::env::set_var("PLATFORM_JWT_PUBLIC_KEY_PEM", TEST_PUB_PEM);
    // A token signed by the env-pinned key must NOT verify without JWKS.
    let token = mint_with_kid("k1", "pinned_attacker");
    let err = verify_with_jwks(&token, None, &refresh).unwrap_err();
    assert!(matches!(err, JwtError::JwksUnavailable(_)), "got {err:?}");
    // And with a JWKS holding a different key it must fail too.
    let other = serde_json::from_value(serde_json::json!({"keys": [{
        "kty":"RSA","kid":"k1","e":"AQAB",
        "n":"qN9GfKa3xA32VKRG51lgzYMrRaqWVekUl_KG24NBoE5bWNtLx9XMfIHfpDXsEoiAhx8ZVosziI3U3Cp2CNKWXxF4qm0o6CsMpbEeeHEJ9qrbh_NvKTfomRHUjAk3s9V7LikBP-8iXOJ03fN281t2T3AtOLt26XjhPIbT3MFzGiLiPanylAmF7H78emfbBVNuCtpOAcwTljC4K3iP90SHEDkBTcMbYxps83a45tGefz5R-8sv6n5gCWlo98QgDVefd_B_IzMMzWikBmJqVmsJ7IdMcnJEbvxsDxg_WqdNVzhCAG2BSo9wsp5SPZNKq4s7d8-i-tafBSTbBKJi4Qwk3w"
    }]})).expect("doc");
    let cache = jwks_cache_from_document(other).expect("cache");
    assert!(verify_with_jwks(&token, Some(&cache), &refresh).is_err());
    std::env::remove_var("PLATFORM_JWT_PUBLIC_KEY_PEM");
}

#[test]
fn algorithm_confusion_is_refused() {
    let refresh = tokio::sync::Notify::new();
    use base64::Engine as _;
    let cache = jwks_cache_from_document(test_jwks("k1", None)).expect("cache");
    let exp = chrono::Utc::now().timestamp() + 3600;
    let b64 = |v: serde_json::Value| {
        base64::engine::general_purpose::URL_SAFE_NO_PAD.encode(v.to_string())
    };
    // alg=none, unsigned.
    let none = format!(
        "{}.{}.",
        b64(serde_json::json!({"alg":"none","typ":"JWT","kid":"k1"})),
        b64(serde_json::json!({"sub":"evil","exp":exp}))
    );
    assert!(
        verify_with_jwks(&none, Some(&cache), &refresh).is_err(),
        "alg=none accepted"
    );
    // HS256 signed with the public key PEM as the HMAC secret.
    let mut header = JwtHeader::new(Algorithm::HS256);
    header.kid = Some("k1".into());
    let hs = encode(
        &header,
        &serde_json::json!({"sub":"evil","exp":exp}),
        &EncodingKey::from_secret(TEST_PUB_PEM.as_bytes()),
    )
    .expect("mint hs256");
    assert!(
        verify_with_jwks(&hs, Some(&cache), &refresh).is_err(),
        "HS256 with public key accepted"
    );
}
