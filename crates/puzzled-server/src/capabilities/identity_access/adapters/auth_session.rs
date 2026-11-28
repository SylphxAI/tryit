//! Sylphx Auth end-user sessions.
//!
//! Puzzled's players are end users of its own Sylphx Auth organization. Their
//! sessions are opaque bearers (`identity_org_session_…`) that only Auth can
//! check, so one middleware in front of the Connect router verifies them with
//! `GET /v1/sessions/current` (cached briefly) and hands the result to the
//! synchronous identity code in [`VERIFIED_IDENTITY_HEADER`]. The header is
//! removed from every incoming request first, so a client can never set it.
//!
//! Auth answers `/v1/sessions/current` for a session of ANY Auth instance, so
//! a session counts only when its principal belongs to Puzzled's own instance
//! (`principal.project_id` equals `SYLPHX_AUTH_ORGANIZATION_ID`). Without that
//! id configured, no session is accepted. The two ids are compared as the
//! 128-bit value they carry ([`auth_id_value`]), so `organization-<uuid>` and
//! the TypeID of the same uuid are the same instance.

mod client;
mod principal;
#[cfg(test)]
mod tests;

pub use client::AuthSessions;
pub(crate) use client::{MetricsAccess, MetricsAccessError};
pub use principal::{
    attach_auth_session, auth_id_value, encode_identity, principal_from_session, session_token,
    verified_identity, SessionPrincipal, LEGACY_SESSION_COOKIE, SESSION_COOKIE,
    VERIFIED_IDENTITY_HEADER,
};

const LOG_TARGET: &str = module_path!();
