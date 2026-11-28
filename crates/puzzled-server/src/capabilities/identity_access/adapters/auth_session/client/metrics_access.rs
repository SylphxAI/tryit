use std::collections::BTreeMap;

use axum::http::{HeaderMap, StatusCode};
use serde::Deserialize;
use serde_json::{json, Value};

use super::{principal_from_session, session_token, session_user_agent, AuthSessions};
use crate::capabilities::identity_access::adapters::auth_session::auth_id_value;

const READ_PERMISSION: &str = "metrics:report:read";

pub(crate) enum MetricsAccess {
    Admin,
    Reader,
}

pub(crate) enum MetricsAccessError {
    Unauthenticated,
    Denied,
}

#[derive(Deserialize)]
struct Attestation {
    allowed: BTreeMap<String, bool>,
    subject: AttestedSubject,
}

#[derive(Deserialize)]
struct AttestedSubject {
    instance_id: String,
    principal_id: String,
    is_guest: bool,
    delegated: bool,
    actor: Value,
}

impl AuthSessions {
    /// The aggregate report needs the Auth subject, not a mapped player.
    /// Session, membership and attestation are all read live, never from the
    /// player cache. A metrics permission never implies admin authority.
    pub(crate) async fn metrics_access(
        &self,
        headers: &HeaderMap,
    ) -> Result<MetricsAccess, MetricsAccessError> {
        use MetricsAccessError::{Denied, Unauthenticated};

        let token = session_token(headers).ok_or(Unauthenticated)?;
        let agent = session_user_agent(headers);
        let http = self.metrics_http.as_ref().ok_or(Denied)?;
        if self.caller_key.is_empty() {
            return Err(Denied);
        }
        let session = || self.current_session_request(http, &token, agent);
        let response = session().send().await.map_err(|_| Denied)?;
        if response.status() == StatusCode::UNAUTHORIZED {
            return Err(Unauthenticated);
        }
        if !response.status().is_success() {
            return Err(Denied);
        }
        let body = response.json().await.map_err(|_| Denied)?;
        let principal = principal_from_session(&body, &self.organization_id).ok_or(Denied)?;
        if principal.actor.is_some() {
            return Err(Denied);
        }

        if self.session_has_admin_role(headers).await {
            return Ok(MetricsAccess::Admin);
        }

        let org = self
            .metrics_customer_organization
            .as_deref()
            .ok_or(Denied)?;
        let mut url = reqwest::Url::parse(&format!(
            "{}/v1/sessions/current/organizations/",
            self.auth_url
        ))
        .map_err(|_| Denied)?;
        url.path_segments_mut()
            .map_err(|_| Denied)?
            .pop_if_empty()
            .push(&format!("{org}:check"));
        let response = self
            .session_request(http.post(url), &token, agent)
            .json(&json!({"permissions": [READ_PERMISSION]}))
            .send()
            .await
            .map_err(|_| Denied)?;
        if !response.status().is_success() {
            return Err(Denied);
        }
        let Attestation { allowed, subject } = response.json().await.map_err(|_| Denied)?;
        if allowed.get(READ_PERMISSION) == Some(&true)
            && subject.principal_id == principal.subject
            // The unscoped session above already established a valid instance ID.
            && auth_id_value(&subject.instance_id) == auth_id_value(&self.organization_id)
            && !subject.is_guest
            && !subject.delegated
            && subject.actor.is_null()
        {
            Ok(MetricsAccess::Reader)
        } else {
            Err(Denied)
        }
    }
}
