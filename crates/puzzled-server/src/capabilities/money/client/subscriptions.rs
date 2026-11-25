use chrono::{DateTime, Utc};
use serde_json::{json, Value};

use super::transport::segment;
use super::{Money, MoneyError};

/// A customer subscription as Money mirrors it.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Subscription {
    pub id: String,
    pub status: String,
    pub cancel_at_period_end: bool,
    pub current_period_end: Option<DateTime<Utc>>,
    /// When its trial ends (Money's `trial_end_time`); None without a trial.
    pub trial_end: Option<DateTime<Utc>>,
    /// The catalogue price keys it sells.
    pub price_keys: Vec<String>,
}

impl Subscription {
    /// Grants access now: trialing, active or past due.
    #[must_use]
    pub fn live(&self) -> bool {
        matches!(self.status.as_str(), "active" | "trialing" | "past_due")
    }

    /// Live and will renew.
    #[must_use]
    pub fn renews(&self) -> bool {
        self.live() && !self.cancel_at_period_end
    }

    /// Erasure guard: may this subscription still bill? Fail closed: every
    /// status except the ones known to be over counts, so a status Money adds
    /// later blocks erasure. Not an entitlement or display rule; those use
    /// [`live`](Self::live) and [`renews`](Self::renews).
    #[must_use]
    pub fn renews_for_erasure(&self) -> bool {
        !matches!(
            self.status.as_str(),
            "canceled" | "incomplete_expired" | "expired"
        ) && !self.cancel_at_period_end
    }
}

/// An RFC 3339 timestamp field of a Money resource; None when absent or unreadable.
fn timestamp(resource: &Value, field: &str) -> Option<DateTime<Utc>> {
    resource
        .get(field)
        .and_then(Value::as_str)
        .and_then(|t| DateTime::parse_from_rfc3339(t).ok())
        .map(|t| t.with_timezone(&Utc))
}

impl Money {
    /// Every customer subscription `user_id` holds. Pages through
    /// `customer_subscriptions` and re-checks each row's subject itself, so a
    /// filter Money ignores cannot hide or invent a match. Any error is
    /// returned: the caller must fail closed rather than assume "none".
    pub async fn subscriptions(&self, user_id: &str) -> Result<Vec<Subscription>, MoneyError> {
        let parent = self.environment_resource().await?;
        let filter = format!("subject.end_user = \"{}\"", user_id.replace('"', ""));
        let mut token = String::new();
        let mut found = Vec::new();
        loop {
            let body = self
                .sdk
                .invoke(
                    "money.customer_subscriptions.list",
                    json!({
                        "parent": parent,
                        "filter": filter,
                        "page_size": 100,
                        "page_token": token,
                    }),
                )
                .await
                .map_err(|e| self.map_sdk_error(e))?;
            for sub in body
                .get("customer_subscriptions")
                .and_then(Value::as_array)
                .into_iter()
                .flatten()
            {
                if sub.pointer("/subject/end_user").and_then(Value::as_str) != Some(user_id) {
                    continue;
                }
                found.push(Subscription {
                    id: sub
                        .get("name")
                        .and_then(Value::as_str)
                        .and_then(|name| name.rsplit('/').next())
                        .unwrap_or_default()
                        .to_string(),
                    status: sub
                        .get("status")
                        .and_then(Value::as_str)
                        .unwrap_or_default()
                        .to_string(),
                    cancel_at_period_end: sub
                        .get("cancel_at_period_end")
                        .and_then(Value::as_bool)
                        .unwrap_or(false),
                    current_period_end: timestamp(sub, "current_period_end_time"),
                    trial_end: timestamp(sub, "trial_end_time"),
                    price_keys: sub
                        .get("items")
                        .and_then(Value::as_array)
                        .into_iter()
                        .flatten()
                        .filter_map(|item| item.get("price").and_then(Value::as_str))
                        .map(str::to_string)
                        .collect(),
                });
            }
            token = body
                .get("next_page_token")
                .and_then(Value::as_str)
                .unwrap_or_default()
                .to_string();
            if token.is_empty() {
                return Ok(found);
            }
        }
    }

    /// Does `user_id` hold a subscription that still renews? Errors are
    /// returned, never read as "no".
    pub async fn has_renewing_subscription(&self, user_id: &str) -> Result<bool, MoneyError> {
        Ok(self
            .subscriptions(user_id)
            .await?
            .iter()
            .any(Subscription::renews_for_erasure))
    }

    pub async fn has_renewing_subscription_for_player(
        &self,
        pool: &sqlx::PgPool,
        user_id: &str,
    ) -> Result<bool, MoneyError> {
        for subj in crate::capabilities::identity_access::adapters::auth_subjects::money_subjects_for_player(pool, user_id).await {
            if self.has_renewing_subscription(&subj).await? {
                return Ok(true);
            }
        }
        Ok(false)
    }

    /// A hosted billing-portal page for `user_id` (payment method, invoices).
    pub async fn portal_url(&self, user_id: &str, return_url: &str) -> Result<String, MoneyError> {
        self.portal_url_for_subscription(user_id, None, return_url)
            .await
    }

    /// A hosted billing-portal page pinned to the processor customer of `subscription_id`
    /// when supplied in `PortalSession.customer_subscription`, so an account
    /// with multiple historic processor customers opens the live subscription's customer.
    pub async fn portal_url_for_subscription(
        &self,
        user_id: &str,
        subscription_id: Option<&str>,
        return_url: &str,
    ) -> Result<String, MoneyError> {
        let env_url = self.env_url().await?;
        let parent = self.environment_resource().await?;
        let mut payload = json!({
            "subject": {"end_user": user_id},
            "return_url": return_url,
        });
        if let Some(sub_id) = subscription_id.map(segment).filter(|s| !s.is_empty()) {
            payload["customer_subscription"] =
                json!(format!("{parent}/customer_subscriptions/{sub_id}"));
        }
        let resp = self
            .http
            .post(format!("{env_url}/portal_sessions"))
            .bearer_auth(&self.secret_key)
            .json(&payload)
            .send()
            .await
            .map_err(|e| MoneyError::Unavailable(self.redact_secrets(&e.to_string())))?;
        let body = self.read_json_response(resp).await?;
        body.get("url")
            .and_then(Value::as_str)
            .filter(|url| !url.is_empty())
            .map(str::to_string)
            .ok_or_else(|| MoneyError::Unavailable("portal session has no url".into()))
    }

    /// End a subscription at its period end without a refund.
    pub async fn cancel_at_period_end(&self, id: &str) -> Result<(), MoneyError> {
        let sub_id = segment(id);
        if sub_id.is_empty() {
            return Err(MoneyError::Unavailable("bad subscription name".into()));
        }
        self.sdk
            .invoke(
                "money.customer_subscriptions.cancel",
                json!({
                    "name": format!("{}/customer_subscriptions/{sub_id}", self.environment_resource().await?),
                    "at_period_end": true,
                }),
            )
            .await
            .map(|_| ())
            .map_err(|e| self.map_sdk_error(e))
    }

    /// Undo a pending cancellation.
    pub async fn resume(&self, id: &str) -> Result<(), MoneyError> {
        let sub_id = segment(id);
        if sub_id.is_empty() {
            return Err(MoneyError::Unavailable("bad subscription name".into()));
        }
        self.sdk
            .invoke(
                "money.customer_subscriptions.resume",
                json!({
                    "name": format!("{}/customer_subscriptions/{sub_id}", self.environment_resource().await?),
                }),
            )
            .await
            .map(|_| ())
            .map_err(|e| self.map_sdk_error(e))
    }
}
