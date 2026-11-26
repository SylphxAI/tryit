use std::collections::HashMap;
use std::sync::{Arc, OnceLock, RwLock};
use std::time::Duration;

use jsonwebtoken::DecodingKey;
use serde::Deserialize;

use super::types::JwtError;

const DEFAULT_JWKS_URL: &str = "https://api.sylphx.com/.well-known/jwks.json";
const JWKS_CACHE_TTL: Duration = Duration::from_secs(300);
/// Floor between two fetches, so unknown-`kid` tokens cannot drive a fetch per request.
const JWKS_MIN_REFRESH_INTERVAL: Duration = Duration::from_secs(10);
const JWKS_FETCH_TIMEOUT: Duration = Duration::from_secs(5);
const JWKS_MAX_RETRY_BACKOFF: Duration = Duration::from_secs(60);

#[derive(Debug, Deserialize)]
pub(super) struct JwksDocument {
    keys: Vec<Jwk>,
}

#[derive(Debug, Deserialize)]
#[allow(dead_code)] // JWKS document fields retained for future alg/use enforcement
struct Jwk {
    kty: String,
    #[serde(default)]
    kid: Option<String>,
    #[serde(default)]
    alg: Option<String>,
    #[serde(default)]
    n: Option<String>,
    #[serde(default)]
    e: Option<String>,
    #[serde(rename = "use", default)]
    key_use: Option<String>,
}

pub(super) struct JwksCache {
    pub(super) keys: HashMap<String, DecodingKey>,
    /// keys without kid
    pub(super) unkeyed: Vec<DecodingKey>,
}

/// Last good key set. The lock is held only to clone or swap the `Arc`.
static JWKS_CACHE: RwLock<Option<Arc<JwksCache>>> = RwLock::new(None);
/// Wakes the refresher early (unknown `kid`, empty cache). Permits coalesce.
static JWKS_REFRESH: OnceLock<tokio::sync::Notify> = OnceLock::new();

pub(super) fn jwks_refresh_signal() -> &'static tokio::sync::Notify {
    JWKS_REFRESH.get_or_init(tokio::sync::Notify::new)
}

#[cfg(not(test))]
pub(super) fn jwks_snapshot() -> Option<Arc<JwksCache>> {
    JWKS_CACHE
        .read()
        .unwrap_or_else(std::sync::PoisonError::into_inner)
        .clone()
}

fn store_jwks(cache: JwksCache) {
    *JWKS_CACHE
        .write()
        .unwrap_or_else(std::sync::PoisonError::into_inner) = Some(Arc::new(cache));
}

/// Retained serialization for database-backed router fixtures. JWT verification
/// has no mutable fixture key or teardown and does not take this lock.
#[cfg(test)]
pub fn test_key_lock() -> &'static std::sync::Mutex<()> {
    static LOCK: std::sync::Mutex<()> = std::sync::Mutex::new(());
    &LOCK
}

fn jwks_url() -> String {
    std::env::var("PLATFORM_JWKS_URL")
        .ok()
        .filter(|s| !s.trim().is_empty())
        .unwrap_or_else(|| DEFAULT_JWKS_URL.to_string())
}

/// Immutable fixture JWKS for router tests; compiled out of production builds.
#[cfg(test)]
#[allow(clippy::expect_used)]
pub(super) fn fixture_jwks() -> Arc<JwksCache> {
    static CACHE: OnceLock<Arc<JwksCache>> = OnceLock::new();
    Arc::clone(CACHE.get_or_init(|| {
        let pem = include_str!("../../../../../testdata/platform_jwt_test_pub.pem");
        Arc::new(JwksCache {
            keys: HashMap::new(),
            unkeyed: vec![DecodingKey::from_rsa_pem(pem.as_bytes()).expect("fixture RSA key")],
        })
    }))
}

pub(super) async fn fetch_jwks(client: &reqwest::Client, url: &str) -> Result<JwksCache, JwtError> {
    let doc: JwksDocument = client
        .get(url)
        .send()
        .await
        .map_err(|e| JwtError::JwksUnavailable(e.to_string()))?
        .error_for_status()
        .map_err(|e| JwtError::JwksUnavailable(e.to_string()))?
        .json()
        .await
        .map_err(|e| JwtError::JwksUnavailable(e.to_string()))?;
    jwks_cache_from_document(doc)
}

pub(super) fn jwks_cache_from_document(doc: JwksDocument) -> Result<JwksCache, JwtError> {
    let mut keys = HashMap::new();
    let mut unkeyed = Vec::new();
    for jwk in doc.keys {
        // Only RSA keys that declare RS256 (or no alg) are accepted; verification
        // is pinned to RS256, so any other declared alg would never verify.
        if jwk.kty != "RSA" || jwk.alg.as_deref().is_some_and(|a| a != "RS256") {
            continue;
        }
        let Some(n) = jwk.n.as_deref() else { continue };
        let Some(e) = jwk.e.as_deref() else { continue };
        let Ok(key) = DecodingKey::from_rsa_components(n, e) else {
            continue;
        };
        if let Some(kid) = jwk.kid.filter(|s| !s.is_empty()) {
            keys.insert(kid, key);
        } else {
            unkeyed.push(key);
        }
    }
    if keys.is_empty() && unkeyed.is_empty() {
        return Err(JwtError::JwksUnavailable(
            "JWKS contained no RSA keys".into(),
        ));
    }
    Ok(JwksCache { keys, unkeyed })
}

/// Start the JWKS refresher on the current tokio runtime.
///
/// Returns `None` only if the HTTP client cannot be built. Call once from the
/// composition root. The first fetch starts immediately; later ones
/// run every `JWKS_CACHE_TTL`, on an early-refresh request (no sooner than
/// `JWKS_MIN_REFRESH_INTERVAL` after the last fetch), or on retry backoff after
/// a failure. The last good key set keeps serving while a refresh fails.
pub fn spawn_jwks_refresher() -> Option<tokio::task::JoinHandle<()>> {
    let client = match reqwest::Client::builder()
        .timeout(JWKS_FETCH_TIMEOUT)
        .build()
    {
        Ok(client) => client,
        Err(error) => {
            tracing::error!(target: super::LOG_TARGET, %error, "jwks client build failed; Bearer verification will return 503");
            return None;
        }
    };
    let url = jwks_url();
    Some(tokio::spawn(async move {
        let signal = jwks_refresh_signal();
        let mut failures: u32 = 0;
        loop {
            let wait = match fetch_jwks(&client, &url).await {
                Ok(cache) => {
                    store_jwks(cache);
                    failures = 0;
                    JWKS_CACHE_TTL
                }
                Err(error) => {
                    failures = failures.saturating_add(1);
                    tracing::warn!(
                        target: super::LOG_TARGET,
                        ?error,
                        failures,
                        "jwks refresh failed; keeping last good key set"
                    );
                    JWKS_MIN_REFRESH_INTERVAL
                        .saturating_mul(failures)
                        .min(JWKS_MAX_RETRY_BACKOFF)
                }
            };
            tokio::time::sleep(JWKS_MIN_REFRESH_INTERVAL.min(wait)).await;
            tokio::select! {
                () = tokio::time::sleep(wait.saturating_sub(JWKS_MIN_REFRESH_INTERVAL)) => {}
                () = signal.notified() => {}
            }
        }
    }))
}
