use axum::http::{header, HeaderMap, StatusCode};
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum JwtError {
    MissingBearer,
    MalformedToken,
    VerificationFailed(String),
    MissingSubject,
    JwksUnavailable(String),
    AudienceMismatch,
}

impl JwtError {
    #[must_use]
    pub fn message(&self) -> &'static str {
        match self {
            Self::MissingBearer => "Missing Authorization Bearer token",
            Self::MalformedToken => "Malformed JWT",
            Self::VerificationFailed(_) => "JWT verification failed",
            Self::MissingSubject => "JWT missing subject",
            Self::JwksUnavailable(_) => "JWKS unavailable",
            Self::AudienceMismatch => "JWT audience rejected",
        }
    }

    #[must_use]
    pub fn status(&self) -> StatusCode {
        match self {
            Self::JwksUnavailable(_) => StatusCode::SERVICE_UNAVAILABLE,
            _ => StatusCode::UNAUTHORIZED,
        }
    }

    #[must_use]
    pub fn code(&self) -> &'static str {
        match self {
            Self::MissingBearer => "missing_bearer",
            Self::MalformedToken => "malformed_token",
            Self::VerificationFailed(_) => "jwt_verification_failed",
            Self::MissingSubject => "missing_subject",
            Self::JwksUnavailable(_) => "jwks_unavailable",
            Self::AudienceMismatch => "audience_mismatch",
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PlatformClaims {
    pub sub: String,
    #[serde(default)]
    pub email: Option<String>,
    #[serde(default)]
    pub name: Option<String>,
    #[serde(default)]
    pub aud: Option<serde_json::Value>,
    #[serde(default)]
    pub iss: Option<String>,
    #[serde(default)]
    pub app_id: Option<String>,
    /// RFC 8693 actor claim: present when an agent acts for `sub`.
    #[serde(default, deserialize_with = "present")]
    pub act: Option<serde_json::Value>,
    /// Auth's `actor` spelling of the same claim.
    #[serde(default, deserialize_with = "present")]
    pub actor: Option<serde_json::Value>,
    pub exp: i64,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct VerifiedIdentity {
    pub user_id: String,
    pub display_name: Option<String>,
    pub email: Option<String>,
    /// Who acts for the user when the credential is delegated (RFC 8693 `act`,
    /// or Auth's `actor`): the actor's subject, or `"delegated"` when the
    /// claim carries no subject. None for the user acting for themselves.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub actor: Option<String>,
}

impl VerifiedIdentity {
    /// True when someone other than the user acts for them (an agent with a
    /// delegated credential).
    #[must_use]
    pub fn is_delegated(&self) -> bool {
        self.actor.is_some()
    }
}

/// The actor an `act` / `actor` field names. Presence is what counts: a field
/// that is there at all, even `null`, `false`, `""` or `{}`, means delegation
/// (fail closed). The actor's `sub` is kept when it has one, else `"delegated"`.
/// None only when the field is absent.
#[must_use]
pub fn actor_from_claim(value: Option<&serde_json::Value>) -> Option<String> {
    use serde_json::Value;
    let named = |text: &str| {
        let text = text.trim();
        (!text.is_empty()).then(|| text.to_string())
    };
    let value = value?;
    let name = match value {
        Value::String(text) => named(text),
        Value::Object(map) => ["sub", "id", "actor_id", "principal_id"]
            .iter()
            .find_map(|k| map.get(*k).and_then(Value::as_str).and_then(named)),
        _ => None,
    };
    Some(name.unwrap_or_else(|| "delegated".to_string()))
}

/// Keep a JSON `null` distinct from a missing field: `Some(None)` is present
/// and null.
fn present<'de, D: serde::Deserializer<'de>>(de: D) -> Result<Option<serde_json::Value>, D::Error> {
    serde::Deserialize::deserialize(de).map(Some)
}

impl PlatformClaims {
    /// The delegated actor, when an `act` or `actor` field is present.
    pub(super) fn delegation(&self) -> Option<String> {
        actor_from_claim(self.act.as_ref()).or_else(|| actor_from_claim(self.actor.as_ref()))
    }
}

/// Extract Bearer token from Authorization header only (cookies may be opaque
/// session ids — those are not Platform JWTs and fail closed here).
#[must_use]
pub fn extract_bearer(headers: &HeaderMap) -> Option<String> {
    let value = headers.get(header::AUTHORIZATION)?.to_str().ok()?;
    let rest = value
        .strip_prefix("Bearer ")
        .or_else(|| value.strip_prefix("bearer "))?;
    let token = rest.trim();
    if token.is_empty() {
        None
    } else {
        Some(token.to_string())
    }
}
