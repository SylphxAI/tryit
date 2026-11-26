//! Puzzled product API shell (ADR-169).
//!
//! Imperative shell: HTTP interfaces, SQL/JWT adapters, composition root.
//! Domain decisions live in `puzzled-core`.

pub mod bootstrap;

/// Generated Connect/Protobuf types (buffa + connectrpc-build).
pub mod proto {
    connectrpc::include_generated!();
}

pub mod capabilities;
pub mod observability;
pub mod shared;

pub use bootstrap::{drain_tasks, http_port, request_shutdown, router, shutdown_signal, AppState};
pub use shared::db_config;

// Compatibility re-exports used by binary and integration surfaces.
pub use capabilities::identity_access::contract::{
    resolve_verified_identity, spawn_jwks_refresher, verify_platform_jwt, VerifiedIdentity,
};

#[cfg(test)]
mod account_erasure_tests;
#[cfg(test)]
mod announcements_tests;
#[cfg(test)]
mod auth_session_tests;
#[cfg(test)]
mod billing_cutover_tests;
#[cfg(test)]
mod checkout_attempt_tests;
#[cfg(test)]
mod compute_tick_tests;
#[cfg(test)]
mod daily_connect_tests;
#[cfg(test)]
mod daily_game_tests;
#[cfg(test)]
mod daily_percentile_tests;
#[cfg(test)]
mod daily_pipeline_tests;
#[cfg(test)]
mod daily_reminder_tests;
#[cfg(test)]
mod funnel_tests;
#[cfg(test)]
mod guest_ownership_tests;
#[cfg(test)]
mod metrics_tests;
#[cfg(test)]
mod money_access_tests;
#[cfg(test)]
mod result_shares_tests;
#[cfg(test)]
mod retention_push_tests;
#[cfg(test)]
mod router_tests;
#[cfg(test)]
mod streak_freeze_tests;
#[cfg(test)]
mod test_support;
#[cfg(test)]
mod today_overview_tests;
#[cfg(test)]
mod today_progress_tests;
#[cfg(test)]
mod tryit_conversions_tests;
#[cfg(test)]
mod unsubscribe_tests;
