use std::collections::HashMap;
use std::sync::{Arc, Mutex};
use std::time::{Duration, Instant};

use axum::http::HeaderMap;
use serde::Deserialize;
use serde_json::Value;
use sqlx::PgPool;

use crate::shared::dest_http::dest_identity_origin;

use super::super::auth_subjects;
use super::super::platform_jwt::VerifiedIdentity;
use super::principal::{principal_from_session, session_token};

const POSITIVE_TTL: Duration = Duration::from_secs(60);
const NEGATIVE_TTL: Duration = Duration::from_secs(10);
const CACHE_LIMIT: usize = 10_000;

type Cache = HashMap<[u8; 32], (Instant, Option<VerifiedIdentity>)>;

/// Verifies Auth session bearers against the Auth instance.
#[derive(Clone)]
pub struct AuthSessions {
    http: reqwest::Client,
    pub(super) auth_url: String,
    /// Puzzled's own Auth instance; empty means no session is accepted.
    organization_id: String,
    /// The product's publishable key (scope auth:public), sent as `x-sylphx-caller-key`; empty
    /// means no session is verified (fail closed).
    caller_key: String,
    cache: Arc<Mutex<Cache>>,
    /// Where the Auth subject to player map lives ([`auth_subjects`]).
    pool: Option<PgPool>,
    /// The operator-managed Auth customer organization for product-wide admin.
    /// This is distinct from the Auth instance ID above and from player workspaces.
    admin_customer_organization: Option<String>,
}

impl AuthSessions {
    #[must_use]
    pub fn new(auth_url: String, organization_id: String, caller_key: String) -> Self {
        Self {
            http: reqwest::Client::builder()
                .timeout(Duration::from_secs(5))
                .build()
                .unwrap_or_default(),
            auth_url: auth_url.trim_end_matches('/').to_string(),
            organization_id: organization_id.trim().to_string(),
            caller_key: caller_key.trim().to_string(),
            cache: Arc::new(Mutex::new(HashMap::new())),
            pool: None,
            admin_customer_organization: None,
        }
    }

    /// Resolve players through the database's subject map.
    #[must_use]
    pub fn with_pool(mut self, pool: Option<PgPool>) -> Self {
        self.pool = pool;
        self
    }

    /// The bound Auth service and the instance's own id and publishable key
    /// (bound by Enable Auth).
    #[must_use]
    pub fn from_env() -> Self {
        Self::from_settings(|name| {
            std::env::var(name)
                .ok()
                .map(|v| v.trim().to_string())
                .filter(|v| !v.is_empty())
        })
    }

    pub(super) fn from_settings(read: impl Fn(&str) -> Option<String>) -> Self {
        let organization_id = read("SYLPHX_AUTH_ORGANIZATION_ID").unwrap_or_else(|| {
            tracing::warn!(
                target: super::LOG_TARGET,
                "SYLPHX_AUTH_ORGANIZATION_ID is unset: no Auth session is accepted"
            );
            String::new()
        });
        // Read once here; never logged. TODO: switch to the identity SDK's
        // `callerKey` option once the published SDK supports it.
        let caller_key = read("SYLPHX_PUBLISHABLE_KEY").unwrap_or_else(|| {
            tracing::warn!(
                target: super::LOG_TARGET,
                "SYLPHX_PUBLISHABLE_KEY is unset: no Auth session is accepted"
            );
            String::new()
        });
        let mut sessions = Self::new(
            dest_identity_origin(read("SYLPHX_AUTH_URL").as_deref()),
            organization_id,
            caller_key,
        );
        sessions.admin_customer_organization = read("PUZZLED_ADMIN_CUSTOMER_ORGANIZATION_ID");
        sessions
    }

    #[cfg(test)]
    pub(crate) fn with_admin_customer_organization(mut self, id: &str) -> Self {
        self.admin_customer_organization = Some(id.to_string());
        self
    }

    /// The end user behind a session bearer; None when Auth refuses it or is
    /// unreachable (fail closed: the request is simply not signed in).
    ///
    /// Auth binds a session to the browser's User-Agent, so it is forwarded
    /// and is part of the cache key.
    pub async fn verify(&self, token: &str, user_agent: &str) -> Option<VerifiedIdentity> {
        let key = token_key(token, user_agent);
        if let Some(hit) = self.cached(&key) {
            return hit;
        }
        let result = self.fetch(token, user_agent).await;
        let ttl = if result.is_some() {
            POSITIVE_TTL
        } else {
            NEGATIVE_TTL
        };
        if let Ok(mut cache) = self.cache.lock() {
            if cache.len() >= CACHE_LIMIT {
                cache.clear();
            }
            cache.insert(key, (Instant::now() + ttl, result.clone()));
        }
        result
    }

    fn cached(&self, key: &[u8; 32]) -> Option<Option<VerifiedIdentity>> {
        let cache = self.cache.lock().ok()?;
        let (expires, value) = cache.get(key)?;
        (*expires > Instant::now()).then(|| value.clone())
    }

    /// Admin grants come from the session user's live Auth membership of the
    /// configured customer organization, not an active workspace or a cached
    /// identity. Auth binds the caller key, session and membership to one
    /// instance. Check the returned instance and customer organization as well.
    pub(crate) async fn session_has_admin_role(&self, headers: &HeaderMap) -> bool {
        let Some(organization) = self.admin_customer_organization.as_deref() else {
            return false;
        };
        let Some(token) = session_token(headers) else {
            return false;
        };
        let Some(body) = self
            .current_session(&token, session_user_agent(headers), Some(organization))
            .await
        else {
            return false;
        };
        principal_from_session(&body, &self.organization_id).is_some_and(|p| p.actor.is_none())
            && has_admin_membership(&body, organization)
    }

    async fn current_session(
        &self,
        token: &str,
        user_agent: &str,
        customer_organization: Option<&str>,
    ) -> Option<Value> {
        if self.caller_key.is_empty() {
            return None;
        }
        let mut request = self
            .http
            .get(format!("{}/v1/sessions/current", self.auth_url))
            .bearer_auth(token)
            .header("x-sylphx-caller-key", &self.caller_key)
            .header(axum::http::header::USER_AGENT, user_agent);
        if let Some(organization) = customer_organization {
            request = request.query(&[("customer_organization", organization)]);
        }
        let response = request
            .send()
            .await
            .map_err(|error| {
                tracing::warn!(
                    target: super::LOG_TARGET,
                    error = %error.without_url(),
                    "auth session check failed"
                );
            })
            .ok()?;
        if !response.status().is_success() {
            return None;
        }
        response.json().await.ok()
    }

    async fn fetch(&self, token: &str, user_agent: &str) -> Option<VerifiedIdentity> {
        let body = self.current_session(token, user_agent, None).await?;
        let principal = principal_from_session(&body, &self.organization_id)?;
        let user_id = match &self.pool {
            Some(pool) => auth_subjects::player_for(
                pool,
                &principal.subject,
                principal.legacy_subject.as_deref(),
            )
            .await
            .map_err(|error| {
                tracing::warn!(target: super::LOG_TARGET, %error, "auth subject lookup failed");
            })
            .ok()?,
            // No database: nothing is stored, so only the old form maps.
            None => auth_subjects::legacy_player_id(&principal.subject)?,
        };
        Some(VerifiedIdentity {
            user_id: user_id.to_string(),
            display_name: principal.display_name,
            email: principal.email,
            actor: principal.actor,
        })
    }
}

#[derive(Deserialize)]
struct CurrentMembership<'a> {
    customer_organization: &'a str,
    roles: Vec<&'a str>,
}

fn has_admin_membership(body: &Value, expected_organization: &str) -> bool {
    body.get("membership")
        .and_then(|membership| CurrentMembership::deserialize(membership).ok())
        .is_some_and(|membership| {
            membership.customer_organization == expected_organization
                && membership.roles.contains(&"admin")
        })
}

pub(super) fn session_user_agent(headers: &HeaderMap) -> &str {
    headers
        .get(axum::http::header::USER_AGENT)
        .and_then(|v| v.to_str().ok())
        .unwrap_or("")
}

fn token_key(token: &str, user_agent: &str) -> [u8; 32] {
    use sha2::Digest;
    let mut hasher = sha2::Sha256::new();
    hasher.update(token.as_bytes());
    hasher.update([0]);
    hasher.update(user_agent.as_bytes());
    hasher.finalize().into()
}
