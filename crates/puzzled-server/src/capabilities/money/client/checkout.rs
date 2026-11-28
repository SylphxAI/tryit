use serde_json::{json, Value};

use super::super::checkout_aliases::valid_id;

use super::transport::{segment, WithHeaders};
use super::{Money, MoneyError};

/// A newly created checkout session returned by Money.
#[derive(Clone, PartialEq, Eq, Default)]
pub struct CreatedCheckout {
    pub url: String,
    pub session_id: String,
    pub processor_session_id: String,
    pub claim_secret: Option<String>,
    pub claim_secret_expires_at: Option<String>,
}

impl std::fmt::Debug for CreatedCheckout {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.debug_struct("CreatedCheckout")
            .field("url", &self.url)
            .field("session_id", &self.session_id)
            .field("processor_session_id", &self.processor_session_id)
            .field(
                "claim_secret",
                &self.claim_secret.as_ref().map(|_| "[redacted]"),
            )
            .field("claim_secret_expires_at", &self.claim_secret_expires_at)
            .finish()
    }
}

/// Verified claim outcome from Money `:claim`.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct ClaimedCheckout {
    pub subject_end_user: String,
    pub plan_id: Option<String>,
}

/// Paid Money checkout facts only; not an entitlement or a quoted price.
#[derive(Debug, PartialEq, Eq)]
pub struct SettledReceipt {
    pub order_id: String,
    pub amount_minor: i64,
    pub currency: String,
}

impl Money {
    pub async fn settled_checkout(
        &self,
        returned: &str,
        lookup: &str,
        subjects: &[String],
    ) -> Option<SettledReceipt> {
        if !valid_id(returned) || !valid_id(lookup) || subjects.is_empty() {
            return None;
        }
        // Dynamic invoke preserves fields newer than the pinned typed SDK schema.
        let session = self.checkout_session(lookup).await.ok()?;
        let text = |key| session.get(key).and_then(Value::as_str).unwrap_or_default();
        let subject = session.pointer("/subject/end_user")?.as_str()?;
        let (parent, canonical) = text("name").rsplit_once("/checkout_sessions/")?;
        if parent != self.environment_resource().await.ok()?
            || !valid_id(canonical)
            || (lookup != returned && canonical != lookup)
            || (canonical != returned && text("processor_session_id") != returned)
            || !subjects.iter().any(|owned| owned == subject)
            || text("state") != "complete"
            || text("payment_status") != "paid"
            || !text("denied_reason").is_empty()
        {
            return None;
        }
        let amount = session.get("amount_total")?;
        let amount_minor = amount.as_i64().or_else(|| amount.as_str()?.parse().ok())?;
        let currency = text("currency_code").to_ascii_uppercase();
        if amount_minor <= 0
            || currency.len() != 3
            || !currency.bytes().all(|b| b.is_ascii_uppercase())
        {
            return None;
        }
        // Money owns the mode-specific choice and sends the same ID in money.checkout.settled.
        // Never infer it from the processor fields or use a checkout session ID.
        let order_id = text("transaction_id");
        if order_id.len() <= 3
            || !(order_id.starts_with("pi_") || order_id.starts_with("in_"))
            || !valid_id(order_id)
        {
            return None;
        }
        Some(SettledReceipt {
            order_id: order_id.to_owned(),
            amount_minor,
            currency,
        })
    }

    /// Create a checkout session over direct HTTP so guest checkout response fields
    /// (`claim_secret`, `claim_secret_expires_at`, `processor_session_id`) are preserved
    /// verbatim without SDK schema stripping.
    pub async fn create_checkout_session_full(
        &self,
        session: &Value,
    ) -> Result<CreatedCheckout, MoneyError> {
        let env_url = self.env_url().await?;
        let resp = self
            .http
            .post(format!("{env_url}/checkout_sessions"))
            .bearer_auth(&self.secret_key)
            .json(session)
            .send()
            .await
            .map_err(|e| MoneyError::Unavailable(self.redact_secrets(&e.to_string())))?;
        let body = self.read_json_response(resp).await?;
        let url = body
            .get("url")
            .and_then(Value::as_str)
            .filter(|url| !url.is_empty())
            .map(str::to_string)
            .ok_or_else(|| MoneyError::Unavailable("checkout session has no url".into()))?;
        let session_id = body
            .get("name")
            .and_then(Value::as_str)
            .and_then(|name| name.rsplit('/').next())
            .unwrap_or_default()
            .to_string();
        let text = |a: &str, b: &str| {
            body.get(a)
                .or_else(|| body.get(b))
                .and_then(Value::as_str)
                .map(str::trim)
                .filter(|s| !s.is_empty())
                .map(str::to_string)
        };
        Ok(CreatedCheckout {
            url,
            session_id,
            processor_session_id: text("processor_session_id", "processorSessionId")
                .unwrap_or_default(),
            claim_secret: text("claim_secret", "claimSecret"),
            claim_secret_expires_at: text("claim_secret_expires_at", "claimSecretExpiresAt"),
        })
    }

    /// Atomically claim a guest checkout session (`chk_...` or `cs_...`) onto `user_id`
    /// via `claim_secret`, or via Auth verified-email match when `claim_secret` is absent.
    pub async fn claim_checkout_session(
        &self,
        checkout_session_id: &str,
        user_id: &str,
        claim_secret: Option<&str>,
        auth_session_token: Option<&str>,
    ) -> Result<ClaimedCheckout, MoneyError> {
        let trimmed = checkout_session_id.trim();
        let id = segment(trimmed);
        if id.is_empty() || id.len() > 128 || id != trimmed {
            return Err(MoneyError::Refused {
                status: 400,
                code: "INVALID_ARGUMENT".into(),
                note: "invalid checkout session id".into(),
            });
        }
        let secret = claim_secret.map(str::trim).filter(|s| !s.is_empty());
        let session_tok = auth_session_token.map(str::trim).filter(|s| !s.is_empty());
        let pk = self.publishable_key.as_deref().filter(|s| !s.is_empty());

        let parse_claimed = |body: Value, fallback_subject: &str| -> ClaimedCheckout {
            let subject_end_user = body
                .pointer("/subject/end_user")
                .or_else(|| body.pointer("/subject/endUser"))
                .or_else(|| body.get("claimed_by"))
                .and_then(Value::as_str)
                .filter(|s| !s.is_empty())
                .unwrap_or(fallback_subject)
                .to_string();
            let plan_id = body
                .pointer("/metadata/plan_id")
                .and_then(Value::as_str)
                .filter(|s| !s.is_empty())
                .map(str::to_string);
            ClaimedCheckout {
                subject_end_user,
                plan_id,
            }
        };

        let body = if let Some(sec) = secret {
            match self.claim_via_server_door(&id, user_id, Some(sec)).await {
                Ok(val) => val,
                Err(MoneyError::Refused { status: 404, .. })
                    if pk.is_some() && session_tok.is_some() =>
                {
                    self.claim_via_client_door(
                        &id,
                        pk.unwrap_or_default(),
                        session_tok.unwrap_or_default(),
                        Some(sec),
                    )
                    .await?
                }
                Err(err) => return Err(err),
            }
        } else if let (Some(pk_val), Some(tok_val)) = (pk, session_tok) {
            self.claim_via_client_door(&id, pk_val, tok_val, None)
                .await?
        } else {
            self.claim_via_server_door(&id, user_id, None).await?
        };

        let claimed = parse_claimed(body, user_id);
        self.refresh_grants(user_id);
        if claimed.subject_end_user != user_id {
            self.refresh_grants(&claimed.subject_end_user);
        }
        Ok(claimed)
    }

    async fn claim_via_server_door(
        &self,
        id: &str,
        user_id: &str,
        secret_opt: Option<&str>,
    ) -> Result<Value, MoneyError> {
        let env_url = self.env_url().await?;
        let mut payload = json!({
            "subject": {"end_user": user_id},
        });
        if let Some(sec) = secret_opt {
            payload["claim_secret"] = Value::String(sec.to_string());
        }
        let resp = self
            .http
            .post(format!("{env_url}/checkout_sessions/{id}:claim"))
            .bearer_auth(&self.secret_key)
            .json(&payload)
            .send()
            .await
            .map_err(|e| MoneyError::Unavailable(self.redact_secrets(&e.to_string())))?;
        self.read_json_response(resp).await
    }

    async fn claim_via_client_door(
        &self,
        id: &str,
        pk_val: &str,
        tok_val: &str,
        secret_opt: Option<&str>,
    ) -> Result<Value, MoneyError> {
        let parent = self.environment_resource().await?;
        let mut payload = json!({});
        if let Some(sec) = secret_opt {
            payload["claim_secret"] = Value::String(sec.to_string());
        }
        let resp = self
            .http
            .post(format!(
                "{}/v1/money/{parent}/checkout_sessions/{id}:claim",
                self.origin
            ))
            .header("x-sylphx-key", pk_val)
            .bearer_auth(tok_val)
            .json(&payload)
            .send()
            .await
            .map_err(|e| MoneyError::Unavailable(self.redact_secrets(&e.to_string())))?;
        self.read_json_response(resp).await
    }

    /// The ordinary Money create route with a retained resource identity.
    /// Both the body and this id are fixed before the first call.
    pub async fn create_retained_checkout(
        &self,
        id: &str,
        session: &Value,
    ) -> Result<Value, MoneyError> {
        let headers = [(
            "Idempotency-Key".to_string(),
            format!("puzzled-checkout-{id}"),
        )];
        sylphx::Client::new(WithHeaders {
            transport: self.sdk.transport(),
            headers: &headers,
        })
        .invoke(
            "money.checkout_sessions.create",
            json!({
                "parent": self.environment_resource().await?,
                "checkout_session_id": id,
                "checkout_session": session,
            }),
        )
        .await
        .map_err(|e| self.map_sdk_error(e))
    }

    /// Authoritative one-time session readback, reconciled by Money.
    pub async fn checkout_session(&self, id: &str) -> Result<Value, MoneyError> {
        let session_id = segment(id);
        if session_id.is_empty() {
            return Err(MoneyError::Unavailable("bad checkout session id".into()));
        }
        self.sdk
            .invoke(
                "money.checkout_sessions.get",
                json!({
                    "name": format!("{}/checkout_sessions/{session_id}", self.environment_resource().await?),
                }),
            )
            .await
            .map_err(|e| self.map_sdk_error(e))
    }
}
