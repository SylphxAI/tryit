use axum::http::HeaderMap;
use jsonwebtoken::{decode, Algorithm, DecodingKey, Validation};

#[cfg(test)]
use super::jwks::fixture_jwks;
#[cfg(not(test))]
use super::jwks::jwks_snapshot;
use super::jwks::{jwks_refresh_signal, JwksCache};
use super::types::{extract_bearer, JwtError, PlatformClaims, VerifiedIdentity};

fn expected_audience() -> Option<String> {
    std::env::var("PLATFORM_JWT_AUDIENCE")
        .ok()
        .map(|s| s.trim().to_string())
        .filter(|s| !s.is_empty())
}

fn expected_issuer() -> Option<String> {
    std::env::var("PLATFORM_JWT_ISSUER")
        .ok()
        .map(|s| s.trim().to_string())
        .filter(|s| !s.is_empty())
}

/// True when identity verification must be fully constrained (production).
fn enforcement_enabled() -> bool {
    std::env::var("PUZZLED_ENV")
        .map(|v| v.trim().eq_ignore_ascii_case("production"))
        .unwrap_or(false)
}

fn validation_config() -> Result<Validation, JwtError> {
    validation_config_inner(
        expected_audience(),
        expected_issuer(),
        enforcement_enabled(),
    )
}

pub(super) fn validation_config_inner(
    audience: Option<String>,
    issuer: Option<String>,
    enforce: bool,
) -> Result<Validation, JwtError> {
    // Exactly RS256: `none` and HS* (public key as HMAC secret) are refused.
    let mut v = Validation::new(Algorithm::RS256);
    v.algorithms = vec![Algorithm::RS256];
    v.validate_exp = true;
    match audience {
        Some(aud) => v.set_audience(&[aud]),
        None if enforce => {
            return Err(JwtError::JwksUnavailable(
                "PLATFORM_JWT_AUDIENCE not configured (required in production)".into(),
            ));
        }
        None => v.validate_aud = false,
    }
    match issuer {
        Some(iss) => v.set_issuer(&[iss]),
        None if enforce => {
            return Err(JwtError::JwksUnavailable(
                "PLATFORM_JWT_ISSUER not configured (required in production)".into(),
            ));
        }
        None => {}
    }
    Ok(v)
}

fn decode_with_key(token: &str, key: &DecodingKey) -> Result<PlatformClaims, JwtError> {
    let config = validation_config()?;
    let data = decode::<PlatformClaims>(token, key, &config)
        .map_err(|e| JwtError::VerificationFailed(e.to_string()))?;
    if data.claims.sub.trim().is_empty() {
        return Err(JwtError::MissingSubject);
    }
    Ok(data.claims)
}

fn header_kid(token: &str) -> Option<String> {
    let header_b64 = token.split('.').next()?;
    // jsonwebtoken can decode header; use manual base64 for kid only
    let padded = match header_b64.len() % 4 {
        2 => format!("{header_b64}=="),
        3 => format!("{header_b64}="),
        _ => header_b64.to_string(),
    };
    let bytes = base64::Engine::decode(
        &base64::engine::general_purpose::URL_SAFE_NO_PAD,
        header_b64,
    )
    .or_else(|_| base64::Engine::decode(&base64::engine::general_purpose::URL_SAFE, &padded))
    .ok()?;
    let v: serde_json::Value = serde_json::from_slice(&bytes).ok()?;
    v.get("kid").and_then(|k| k.as_str()).map(|s| s.to_string())
}

/// Verify a raw JWT string against Platform JWKS (fixed fixture JWKS in unit tests).
pub fn verify_platform_jwt(token: &str) -> Result<VerifiedIdentity, JwtError> {
    #[cfg(not(test))]
    let cache = jwks_snapshot();
    #[cfg(test)]
    let cache = Some(fixture_jwks());
    verify_with_jwks(token, cache.as_deref(), jwks_refresh_signal())
}

/// The real verification path takes a snapshot and its refresh signal explicitly.
/// Requests never fetch inline; independent tests cannot replace each other's keys
/// or consume each other's early-refresh permits.
pub(super) fn verify_with_jwks(
    token: &str,
    cache: Option<&JwksCache>,
    refresh: &tokio::sync::Notify,
) -> Result<VerifiedIdentity, JwtError> {
    let token = token.trim();
    if token.is_empty() {
        return Err(JwtError::MissingBearer);
    }
    if token.split('.').count() != 3 {
        return Err(JwtError::MalformedToken);
    }

    let Some(cache) = cache else {
        refresh.notify_one();
        return Err(JwtError::JwksUnavailable("jwks not loaded yet".into()));
    };

    let mut last_err = JwtError::VerificationFailed("no keys tried".into());
    if let Some(kid) = header_kid(token) {
        if !cache.keys.contains_key(&kid) {
            // Possible key rotation: fetch early in the background.
            refresh.notify_one();
        }
        if let Some(key) = cache.keys.get(&kid) {
            match decode_with_key(token, key) {
                Ok(claims) => {
                    return Ok(VerifiedIdentity {
                        user_id: claims.sub.trim().to_string(),
                        display_name: claims.name.clone(),
                        email: claims.email.clone(),
                        actor: claims.delegation(),
                    });
                }
                Err(e) => last_err = e,
            }
        }
    }
    for key in cache.keys.values().chain(cache.unkeyed.iter()) {
        match decode_with_key(token, key) {
            Ok(claims) => {
                return Ok(VerifiedIdentity {
                    user_id: claims.sub.trim().to_string(),
                    display_name: claims.name.clone(),
                    email: claims.email.clone(),
                    actor: claims.delegation(),
                });
            }
            Err(e) => last_err = e,
        }
    }
    Err(last_err)
}

/// Resolve verified identity from request headers. Never trusts `x-user-id`.
pub fn resolve_verified_identity(headers: &HeaderMap) -> Result<VerifiedIdentity, JwtError> {
    let Some(token) = extract_bearer(headers) else {
        return Err(JwtError::MissingBearer);
    };
    verify_platform_jwt(&token)
}
