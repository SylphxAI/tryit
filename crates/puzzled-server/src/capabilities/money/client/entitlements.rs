use std::collections::HashMap;
use std::time::{Duration, Instant};

use chrono::{DateTime, Utc};
use serde::Deserialize;
use serde_json::json;

use super::transport::redact_error;
use super::{Money, MoneyError};

/// Longest a positive entitlement answer is reused (Money integration rule).
pub const GRANT_CACHE_TTL: Duration = Duration::from_secs(60);
/// A "not entitled" answer is reused only briefly, so a buyer whose grant has
/// just arrived is not kept waiting a full minute.
pub const DENIED_CACHE_TTL: Duration = Duration::from_secs(10);
/// A failed Money check is remembered as "not entitled" this long, so an
/// outage does not turn every request into a slow timed-out call.
pub const FAILED_CACHE_TTL: Duration = Duration::from_secs(5);

/// (fresh until, the answer; None is a failed check remembered briefly).
pub(super) type GrantCache = HashMap<(String, String), (Instant, Option<Grant>)>;

/// Money's answer to one entitlement check.
#[derive(Debug, Clone, PartialEq, Eq, Default)]
pub struct Grant {
    pub entitled: bool,
    /// For a `limit` feature, the allowance the subject holds.
    pub limit: Option<u32>,
    /// When the answering grant ends; None for no end.
    pub ends_at: Option<DateTime<Utc>>,
}

impl Grant {
    /// The fail-closed answer.
    #[must_use]
    pub fn denied() -> Self {
        Self::default()
    }
}

#[derive(Deserialize)]
struct CheckResponse {
    #[serde(default)]
    entitled: bool,
    #[serde(default)]
    limit: Option<String>,
    #[serde(default)]
    expire_time: Option<String>,
}

impl Money {
    /// One entitlement check, uncached. `feature` is a catalogue feature key.
    pub async fn check_uncached(&self, user_id: &str, feature: &str) -> Result<Grant, MoneyError> {
        let body = self
            .sdk
            .invoke(
                "money.entitlement_grants.check",
                json!({
                    "parent": self.environment_resource().await?,
                    "subject": {"end_user": user_id},
                    "feature": feature,
                }),
            )
            .await
            .map_err(|e| self.map_sdk_error(e))?;
        let parsed: CheckResponse = serde_json::from_value(body).map_err(|e| {
            MoneyError::Unavailable(format!(
                "unreadable answer: {}",
                redact_error(&e.to_string(), &self.secret_key)
            ))
        })?;
        let ends = parsed
            .expire_time
            .as_deref()
            .filter(|s| !s.is_empty())
            .and_then(|s| DateTime::parse_from_rfc3339(s).ok())
            .map(|t| t.with_timezone(&Utc));
        // An answer whose own end has passed grants nothing.
        let entitled = parsed.entitled && ends.is_none_or(|end| end > Utc::now());
        Ok(Grant {
            entitled,
            limit: parsed.limit.as_deref().and_then(|l| l.trim().parse().ok()),
            ends_at: ends,
        })
    }

    /// Forget this account's cached answers on checkout return. This does not
    /// grant access: the next read must still be confirmed by Money. Clones
    /// share the cache, so paid play sees the same fresh answer as Settings.
    pub fn refresh_grants(&self, user_id: &str) {
        if let Ok(mut cache) = self.grants.lock() {
            cache.retain(|(subject, _), _| subject != user_id);
        }
    }

    /// The entitlement answer for `feature`, from the cache when it is fresh
    /// and otherwise from Money. A Money error is an `Err`, remembered for 5
    /// seconds so an outage is not retried per request; callers that must tell
    /// "Money said no" from "Money could not answer" use this.
    pub async fn try_check(&self, user_id: &str, feature: &str) -> Result<Grant, MoneyError> {
        let key = (user_id.to_string(), feature.to_string());
        if let Some((fresh_until, cached)) =
            self.grants.lock().ok().and_then(|c| c.get(&key).cloned())
        {
            if fresh_until > Instant::now() {
                match cached {
                    None => return Err(MoneyError::Unavailable("recent check failed".into())),
                    Some(grant) if grant.ends_at.is_none_or(|end| end > Utc::now()) => {
                        return Ok(grant);
                    }
                    Some(_) => {}
                }
            }
        }
        let grant = match self.check_uncached(user_id, feature).await {
            Ok(grant) => grant,
            Err(error) => {
                tracing::warn!(%error, feature, "Money entitlement check failed");
                if let Ok(mut cache) = self.grants.lock() {
                    cache.insert(key, (Instant::now() + FAILED_CACHE_TTL, None));
                }
                return Err(error);
            }
        };
        // The cache window is 60 s, and never runs past the grant's own end.
        let ttl = if grant.entitled {
            GRANT_CACHE_TTL
        } else {
            DENIED_CACHE_TTL
        };
        let until_end = grant
            .ends_at
            .and_then(|end| (end - Utc::now()).to_std().ok())
            .unwrap_or(ttl);
        let fresh_until = Instant::now() + ttl.min(until_end);
        if let Ok(mut cache) = self.grants.lock() {
            cache.insert(key, (fresh_until, Some(grant.clone())));
        }
        Ok(grant)
    }

    /// The entitlement answer for `feature`. Fails closed: a Money error
    /// answers [`Grant::denied`] (cached 5 seconds).
    pub async fn check(&self, user_id: &str, feature: &str) -> Grant {
        self.try_check(user_id, feature)
            .await
            .unwrap_or_else(|_| Grant::denied())
    }
}
