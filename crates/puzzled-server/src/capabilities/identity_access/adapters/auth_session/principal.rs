use axum::body::Body;
use axum::extract::State;
use axum::http::header::{AUTHORIZATION, COOKIE};
use axum::http::{HeaderMap, HeaderValue, Request};
use axum::middleware::Next;
use axum::response::Response;
use base64::Engine;
use serde_json::Value;

use crate::proto::puzzled::v1::BILLING_SERVICE_GET_PASS_ELIGIBILITY_SPEC;

use super::super::platform_jwt::{actor_from_claim, VerifiedIdentity};
use super::client::{session_user_agent, AuthSessions};

/// Internal header carrying the verified end user (base64url JSON).
pub const VERIFIED_IDENTITY_HEADER: &str = "x-puzzled-verified-identity";
/// The web's session cookie (set by `apps/puzzled/src/lib/identity/session-cookie.ts`).
pub const SESSION_COOKIE: &str = "puzzled_session";
/// The cookie's previous name, still read so the rename signs nobody out.
// TODO(2026-10-31): drop LEGACY_SESSION_COOKIE and its read in `session_token`.
pub const LEGACY_SESSION_COOKIE: &str = "sylphx_identity_session";
const SESSION_PREFIX: &str = "identity_org_session_";

/// The principal a session read reports: the Auth subject as published and,
/// during Auth's subject ID migration, the subject it
/// replaced.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct SessionPrincipal {
    pub subject: String,
    pub legacy_subject: Option<String>,
    pub display_name: Option<String>,
    pub email: Option<String>,
    /// Who acts for this principal when the session is delegated (an `act` or
    /// `actor` field). Auth's published `GetCurrentSessionResponse` does not
    /// declare one (cloud identity contract `sylphx.identity.v1`), so this is
    /// read defensively and is None until Auth adds it; see
    /// docs/capabilities.md PUZ-AUTH-DELEGATED.
    pub actor: Option<String>,
}

/// Read `GetCurrentSessionResponse` (snake or camel case). An inactive
/// principal is no principal, and neither is one from any Auth instance but
/// `expected_organization` (Puzzled's own): a missing, empty or different
/// `project_id`, or an empty `expected_organization`, is refused.
#[must_use]
pub fn principal_from_session(
    body: &Value,
    expected_organization: &str,
) -> Option<SessionPrincipal> {
    let session = body.get("session").unwrap_or(body);
    let principal = session.get("principal")?;
    let text = |keys: &[&str]| {
        keys.iter()
            .find_map(|k| principal.get(*k).and_then(Value::as_str))
            .map(str::trim)
            .filter(|v| !v.is_empty())
            .map(str::to_string)
    };
    let expected = auth_id_value(expected_organization)?;
    let project = text(&["project_id", "projectId"]);
    if project.as_deref().and_then(auth_id_value) != Some(expected) {
        tracing::warn!(
            target: super::LOG_TARGET,
            project_id = project.as_deref().unwrap_or(""),
            "auth session from another Auth instance refused"
        );
        return None;
    }
    let subject = text(&["principal_id", "principalId"])?;
    let state = text(&["state"]);
    if state.as_deref().is_some_and(|s| s != "active") {
        return None;
    }
    let legacy_subject = text(&[
        "legacy_principal_id",
        "legacyPrincipalId",
        "sylphx_legacy_sub",
    ])
    .filter(|legacy| *legacy != subject);
    Some(SessionPrincipal {
        subject,
        legacy_subject,
        display_name: text(&["display_name", "displayName"]),
        email: text(&["primary_email", "primaryEmail"]),
        actor: delegation_actor(body, session, principal),
    })
}

/// The delegation claim of a session read, wherever Auth puts it: `act` or
/// `actor` on the response, the session or the principal.
fn delegation_actor(body: &Value, session: &Value, principal: &Value) -> Option<String> {
    [body, session, principal]
        .into_iter()
        .flat_map(|node| ["act", "actor"].into_iter().map(move |k| node.get(k)))
        .find_map(actor_from_claim)
}

/// The 128-bit value an Auth id carries, in any of its forms:
/// `organization-<uuid>`, a TypeID (`<prefix>_<26 base32 chars>`, spec v0.3)
/// or a bare uuid (canonical 8-4-4-4-12 hex, any case). Anything else is None.
#[must_use]
pub fn auth_id_value(raw: &str) -> Option<u128> {
    let raw = raw.trim();
    let uuid = |s: &str| {
        let canonical = s.len() == 36
            && s.char_indices().all(|(i, c)| match i {
                8 | 13 | 18 | 23 => c == '-',
                _ => c.is_ascii_hexdigit(),
            });
        canonical
            .then(|| u128::from_str_radix(&s.replace('-', ""), 16).ok())
            .flatten()
    };
    if let Some(value) = raw.strip_prefix("organization-").and_then(uuid) {
        return Some(value);
    }
    if let Some((prefix, suffix)) = raw.split_once('_') {
        const ALPHABET: &[u8] = b"0123456789abcdefghjkmnpqrstvwxyz";
        let prefix_ok =
            (2..=5).contains(&prefix.len()) && prefix.bytes().all(|b| b.is_ascii_lowercase());
        if !prefix_ok || suffix.len() != 26 || !matches!(suffix.as_bytes()[0], b'0'..=b'7') {
            return None;
        }
        // 26 digits of 5 bits; a first digit of at most 7 keeps it in 128.
        return suffix.bytes().try_fold(0u128, |value, byte| {
            let digit = ALPHABET.iter().position(|&a| a == byte)?;
            Some((value << 5) | digit as u128)
        });
    }
    uuid(raw)
}

/// The Auth session bearer on a request: `Authorization: Bearer
/// identity_org_session_…` or the web's session cookie.
#[must_use]
pub fn session_token(headers: &HeaderMap) -> Option<String> {
    if let Some(bearer) = headers
        .get(AUTHORIZATION)
        .and_then(|v| v.to_str().ok())
        .and_then(|v| v.strip_prefix("Bearer "))
        .map(str::trim)
        .filter(|v| v.starts_with(SESSION_PREFIX))
    {
        return Some(bearer.to_string());
    }
    // The new name first, then the old one.
    [SESSION_COOKIE, LEGACY_SESSION_COOKIE]
        .into_iter()
        .find_map(|wanted| {
            headers
                .get_all(COOKIE)
                .iter()
                .filter_map(|v| v.to_str().ok())
                .flat_map(|v| v.split(';'))
                .find_map(|pair| {
                    let (name, value) = pair.trim().split_once('=')?;
                    let value = value.trim();
                    (name.trim() == wanted && value.starts_with(SESSION_PREFIX))
                        .then(|| value.to_string())
                })
        })
}

/// Encode a verified identity for [`VERIFIED_IDENTITY_HEADER`].
#[must_use]
pub fn encode_identity(identity: &VerifiedIdentity) -> Option<HeaderValue> {
    let json = serde_json::to_vec(identity).ok()?;
    HeaderValue::from_str(&base64::engine::general_purpose::URL_SAFE_NO_PAD.encode(json)).ok()
}

/// The identity the middleware verified on this request, if any.
#[must_use]
pub fn verified_identity(headers: &HeaderMap) -> Option<VerifiedIdentity> {
    let raw = headers.get(VERIFIED_IDENTITY_HEADER)?.to_str().ok()?;
    let json = base64::engine::general_purpose::URL_SAFE_NO_PAD
        .decode(raw)
        .ok()?;
    serde_json::from_slice(&json).ok()
}

/// Middleware: strip any client copy of the internal header, then attach the
/// verified end user when the request carries a valid Auth session.
pub async fn attach_auth_session(
    State(sessions): State<AuthSessions>,
    mut request: Request<Body>,
    next: Next,
) -> Response {
    request.headers_mut().remove(VERIFIED_IDENTITY_HEADER);
    if request.uri().path() == "/v1/guest/session" {
        return next.run(request).await;
    }
    if let Some(token) = session_token(request.headers()) {
        let agent = session_user_agent(request.headers());
        let identity =
            if request.uri().path() == BILLING_SERVICE_GET_PASS_ELIGIBILITY_SPEC.procedure {
                sessions.verify_mapped(&token, agent).await
            } else {
                sessions.verify(&token, agent).await
            };
        if let Some(value) = identity.as_ref().and_then(encode_identity) {
            request
                .headers_mut()
                .insert(VERIFIED_IDENTITY_HEADER, value);
        }
    }
    next.run(request).await
}
