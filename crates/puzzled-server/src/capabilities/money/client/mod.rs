//! Thin REST client for the Money calls Puzzled uses, shaped from
//! the Sylphx Money API contract: `entitlement_grants:check`,
//! `checkout_sessions` and `price_catalogs/default`. Nothing else is called.
//!
//! Entitlement answers are cached at most 60 seconds and never past the
//! answer's `expire_time`; a Money call that fails answers "not entitled"
//! (fail closed) and is never served stale past that cache window.

mod attribution;
mod catalog;
mod checkout;
mod entitlements;
mod error;
mod subscriptions;
mod transport;

use std::sync::{Arc, Mutex};

use serde_json::Value;

use crate::shared::public_origin::{parse_public_origin, DEFAULT_PUBLIC_URL};

use self::catalog::CatalogSlot;
use self::entitlements::GrantCache;
use self::transport::REQUEST_TIMEOUT;

pub use self::catalog::{
    Catalog, CatalogLicence, CatalogLicenceTerm, CatalogPrice, CatalogProduct, CatalogSpec,
    CATALOG_CACHE_TTL,
};
pub use self::checkout::{ClaimedCheckout, CreatedCheckout};
pub use self::entitlements::{Grant, DENIED_CACHE_TTL, FAILED_CACHE_TTL, GRANT_CACHE_TTL};
pub use self::error::MoneyError;
pub use self::subscriptions::Subscription;
pub use self::transport::resolve_env_url;
pub(super) use self::transport::sdk;

const DEFAULT_API_URL: &str = "https://api.sylphx.com";

#[derive(Clone)]
pub struct Money {
    sdk: Arc<sylphx::Client>,
    http: reqwest::Client,
    /// `https://api.sylphx.com`.
    origin: String,
    /// The environment's resource URL,
    /// `{origin}/v1/orgs/{org}/projects/{project}/envs/{env}`, read from the
    /// key's `whoami` on first use and kept. Never written in configuration:
    /// the env id it names is the key's own.
    base: Arc<tokio::sync::OnceCell<String>>,
    secret_key: String,
    publishable_key: Option<String>,
    public_url: String,
    grants: Arc<Mutex<GrantCache>>,
    catalog: Arc<Mutex<CatalogSlot>>,
}

fn env_value(name: &str) -> Option<String> {
    std::env::var(name)
        .ok()
        .map(|value| value.trim().to_string())
        .filter(|value| !value.is_empty())
}

/// The environment URL from a `whoami` body. `env` is the environment's full
/// resource name (`orgs/{o}/projects/{p}/envs/{e}`), used as-is under
/// `{origin}/v1/`; bare `org`/`project`/`env` ids build the same path.
pub(super) fn env_url(origin: &str, whoami: &Value) -> Result<String, MoneyError> {
    let part = |name: &str| {
        whoami
            .get(name)
            .and_then(Value::as_str)
            .map(|v| v.trim_matches('/'))
            .filter(|v| !v.is_empty())
    };
    if let Some(env) = part("env").filter(|e| e.starts_with("orgs/")) {
        return Ok(format!("{origin}/v1/{env}"));
    }
    match (part("org"), part("project"), part("env")) {
        (Some(org), Some(project), Some(env)) => Ok(format!(
            "{origin}/v1/orgs/{org}/projects/{project}/envs/{env}"
        )),
        _ => Err(MoneyError::Unavailable(
            "the API key is not scoped to an environment".into(),
        )),
    }
}

impl Money {
    /// Money is used when its dedicated key (`SYLPHX_MONEY_API_KEY`, scopes
    /// billing:read and billing:write) is configured; its org, project and env
    /// come from the key's `whoami` (`SYLPHX_API_URL`, default
    /// `https://api.sylphx.com`). Without it Money is off and Puzzled keeps its
    /// existing behaviour; `SYLPHX_API_KEY` is never used for Money.
    #[must_use]
    pub fn from_env() -> Option<Self> {
        Self::from_lookup(env_value)
    }

    pub(super) fn from_lookup(get: impl Fn(&str) -> Option<String>) -> Option<Self> {
        let mut money = Self::discovering(
            &get("SYLPHX_API_URL").unwrap_or_else(|| DEFAULT_API_URL.into()),
            &get("SYLPHX_MONEY_API_KEY")?,
            &parse_public_origin(
                &get("PUZZLED_PUBLIC_URL").unwrap_or_else(|| DEFAULT_PUBLIC_URL.into()),
                !cfg!(debug_assertions),
            )
            .ok()?,
        );
        money.publishable_key = get("SYLPHX_PUBLISHABLE_KEY");
        Some(money)
    }

    /// A client whose environment URL is read from the key on first use.
    #[must_use]
    pub fn discovering(origin: &str, secret_key: &str, public_url: &str) -> Self {
        let origin = origin.trim_end_matches('/').to_string();
        let mut money = Self::new("", secret_key, public_url);
        money.origin.clone_from(&origin);
        money.sdk = sdk(&origin, secret_key);
        money.base = Arc::default();
        money
    }

    /// A client with a known environment URL (tests, or a caller that already
    /// resolved it).
    #[must_use]
    pub fn new(env_url: &str, secret_key: &str, public_url: &str) -> Self {
        let trimmed_env = env_url.trim_end_matches('/').to_string();
        let origin = trimmed_env.split_once("/v1/").map_or_else(
            || DEFAULT_API_URL.to_string(),
            |(origin, _)| origin.to_string(),
        );
        let sdk = sdk(&origin, secret_key);
        let http = reqwest::Client::builder()
            .timeout(REQUEST_TIMEOUT)
            .build()
            .unwrap_or_default();
        let base = Arc::new(tokio::sync::OnceCell::new());
        if !trimmed_env.is_empty() {
            let _ = base.set(trimmed_env);
        }
        Self {
            sdk,
            http,
            origin,
            base,
            secret_key: secret_key.to_string(),
            publishable_key: None,
            public_url: public_url.trim_end_matches('/').to_string(),
            grants: Arc::default(),
            catalog: Arc::default(),
        }
    }

    pub async fn environment_resource(&self) -> Result<String, MoneyError> {
        self.env_url()
            .await?
            .split_once("/v1/")
            .map(|(_, name)| name.to_owned())
            .ok_or_else(|| MoneyError::Unavailable("environment binding unavailable".into()))
    }

    /// Resolve the environment now (at start-up), so a bad key shows in the
    /// log rather than on the first request. Failure is retried on use.
    pub async fn warm(&self) -> Result<(), MoneyError> {
        self.env_url().await.map(|_| ())
    }

    #[must_use]
    pub fn public_url(&self) -> &str {
        &self.public_url
    }

    #[must_use]
    pub fn with_publishable_key(mut self, publishable_key: impl Into<String>) -> Self {
        let trimmed = publishable_key.into().trim().to_string();
        self.publishable_key = (!trimmed.is_empty()).then_some(trimmed);
        self
    }
}
