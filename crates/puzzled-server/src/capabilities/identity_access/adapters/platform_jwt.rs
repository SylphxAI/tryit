//! Platform RS256 / JWKS identity verification for puzzled-server.
#![allow(clippy::expect_used)]
//!
//! Caller-supplied `x-user-id` is never trusted as identity. Protected routes
//! must present a Bearer JWT whose signature verifies against Platform JWKS
//! (production has no pinned-key override). `sub` is the only accepted user id.
//!
//! JWKS is fetched off the request path: [`spawn_jwks_refresher`] runs one
//! async task that loads the key set at startup, refreshes it every
//! `JWKS_CACHE_TTL`, and refetches early (rate-limited) when a token names an
//! unknown `kid`. Verification only reads an `Arc` snapshot, so no lock is held
//! across network I/O and no tokio worker blocks.

mod jwks;
mod types;
mod verify;

#[cfg(test)]
mod tests;

pub use jwks::spawn_jwks_refresher;
#[cfg(test)]
pub use jwks::test_key_lock;
pub use types::{actor_from_claim, extract_bearer, JwtError, PlatformClaims, VerifiedIdentity};
pub use verify::{resolve_verified_identity, verify_platform_jwt};

// Preserve the tracing target used by the refresher before the split.
const LOG_TARGET: &str = module_path!();
