use std::sync::Arc;
use std::time::Duration;

use serde_json::{json, Value};

use super::error::problem_note;
use super::{env_url, Money, MoneyError};

pub(super) const REQUEST_TIMEOUT: Duration = Duration::from_secs(8);

/// A path segment that cannot escape its place in the URL.
pub(super) fn segment(id: &str) -> String {
    id.chars()
        .filter(|c| c.is_ascii_alphanumeric() || matches!(c, '_' | '-'))
        .collect()
}

pub(super) struct WithHeaders<'a> {
    pub(super) transport: &'a sylphx::HttpTransport,
    pub(super) headers: &'a [(String, String)],
}

impl sylphx::Transport for WithHeaders<'_> {
    async fn send(
        &self,
        request: sylphx::HttpRequest,
    ) -> Result<sylphx::HttpResponse, sylphx::Error> {
        self.transport
            .send_with_headers(request, self.headers)
            .await
    }
}

pub(super) fn redact_error(message: &str, secret_key: &str) -> String {
    let trimmed = secret_key.trim();
    if trimmed.is_empty() {
        message.to_string()
    } else {
        message.replace(trimmed, "[redacted]")
    }
}

#[allow(clippy::expect_used)]
pub(in crate::capabilities::money) fn sdk(origin: &str, secret_key: &str) -> Arc<sylphx::Client> {
    let mut builder = sylphx::HttpTransport::builder()
        .base_url(origin.trim_end_matches('/'))
        .timeout(REQUEST_TIMEOUT)
        .max_retries(0);
    let key = secret_key.trim();
    if !key.is_empty() {
        builder = builder.api_key(key);
    }
    Arc::new(sylphx::Client::new(
        builder
            .build()
            .expect("valid Money transport configuration"),
    ))
}

/// The environment resource URL a key belongs to, from its `whoami`:
/// `{origin}/v1/orgs/{org}/projects/{project}/envs/{env}`. The key must be
/// scoped to an environment.
pub async fn resolve_env_url(origin: &str, key: &str) -> Result<String, MoneyError> {
    resolve_env_url_with(&sdk(origin, key), origin, key).await
}

pub(super) async fn resolve_env_url_with(
    sdk: &sylphx::Client,
    origin: &str,
    key: &str,
) -> Result<String, MoneyError> {
    let me = sdk.access().whoami(Default::default()).await.map_err(|e| {
        MoneyError::Unavailable(format!(
            "whoami failed: {}",
            redact_error(&e.to_string(), key)
        ))
    })?;
    let body = serde_json::to_value(me).map_err(|e| {
        MoneyError::Unavailable(format!(
            "whoami unreadable: {}",
            redact_error(&e.to_string(), key)
        ))
    })?;
    env_url(origin, &body)
}

impl Money {
    /// The environment resource URL, discovered once and kept.
    pub(super) async fn env_url(&self) -> Result<&str, MoneyError> {
        self.base
            .get_or_try_init(|| {
                crate::shared::verification_timing::money(resolve_env_url_with(
                    &self.sdk,
                    &self.origin,
                    &self.secret_key,
                ))
            })
            .await
            .map(String::as_str)
    }

    pub(super) fn redact_secrets(&self, message: &str) -> String {
        let first = redact_error(message, &self.secret_key);
        match self.publishable_key.as_deref() {
            Some(pk) => redact_error(&first, pk),
            None => first,
        }
    }

    pub(super) async fn read_json_response(
        &self,
        resp: reqwest::Response,
    ) -> Result<Value, MoneyError> {
        let status = resp.status().as_u16();
        let bytes = resp
            .bytes()
            .await
            .map_err(|e| MoneyError::Unavailable(self.redact_secrets(&e.to_string())))?;
        if (200..300).contains(&status) {
            if bytes.is_empty() {
                return Ok(json!({}));
            }
            return serde_json::from_slice(&bytes).map_err(|e| {
                MoneyError::Unavailable(format!(
                    "unreadable answer: {}",
                    self.redact_secrets(&e.to_string())
                ))
            });
        }
        let body: Value = serde_json::from_slice(&bytes).unwrap_or(Value::Null);
        if (400..500).contains(&status) && status != 408 && status != 429 {
            let raw_code = [
                body.get("code").and_then(Value::as_str).unwrap_or_default(),
                body.get("title")
                    .and_then(Value::as_str)
                    .unwrap_or_default(),
                body.get("detail")
                    .and_then(Value::as_str)
                    .unwrap_or_default(),
            ]
            .into_iter()
            .find(|s| !s.is_empty())
            .unwrap_or("refused");
            return Err(MoneyError::Refused {
                status,
                code: self.redact_secrets(raw_code),
                note: self.redact_secrets(&problem_note(&body)),
            });
        }
        Err(MoneyError::Unavailable(format!(
            "money answered {status}: {}",
            self.redact_secrets(&problem_note(&body))
        )))
    }

    pub(super) fn map_sdk_error(&self, error: sylphx::Error) -> MoneyError {
        match error {
            sylphx::Error::Api {
                status,
                code,
                detail,
                problem,
                ..
            } if (400..500).contains(&status) && status != 408 && status != 429 => {
                let raw_code = [
                    problem.code.as_str(),
                    code.as_str(),
                    problem.title.as_str(),
                    detail.as_str(),
                ]
                .into_iter()
                .find(|s| !s.is_empty())
                .unwrap_or("refused");
                let problem_value = serde_json::to_value(&*problem).unwrap_or(Value::Null);
                MoneyError::Refused {
                    status,
                    code: redact_error(raw_code, &self.secret_key),
                    note: redact_error(&problem_note(&problem_value), &self.secret_key),
                }
            }
            other => MoneyError::Unavailable(redact_error(&other.to_string(), &self.secret_key)),
        }
    }
}
