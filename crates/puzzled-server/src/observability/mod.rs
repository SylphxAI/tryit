//! Error capture into Sylphx Observability (OBS-ERRORS) through the Sylphx
//! SDK: `sylphx::observability` `error_groups().capture` on api.sylphx.com
//! with the environment's Access key (`SYLPHX_API_KEY`, minted and injected
//! by the platform). Captures panics and every 5xx response.
//!
//! Each event carries the service, release (`SYLPHX_GIT_COMMIT_SHA`),
//! environment (`SYLPHX_ENVIRONMENT_TYPE`), the route template (never the raw
//! path or query), the error kind and message, and a stack. Message, stack
//! strings and tag values are scrubbed here ([`scrub`]) before they leave the
//! process; the service scrubs again on ingest. No request or response body
//! and no header is ever attached.
//!
//! Observability is a soft dependency and never blocks or fails a request:
//! a [`Reporter`] builds, scrubs and rate-limits an event (the same
//! fingerprint at most once per 10 s), then `try_send`s it into a bounded
//! queue (64) drained by ONE worker task ([`run_worker`]) with a 3 s call
//! timeout. A full queue drops the event and counts it. Without a key the
//! reporter only logs.

mod event;
mod reporter;
mod scrub;

pub use event::error_event;
pub use reporter::{
    capture, capture_server_errors, client, init, run_worker, RateLimiter, Reporter, PARENT,
    QUEUE_CAPACITY, RATE_WINDOW, UNMATCHED_ROUTE,
};
pub use scrub::scrub;

/// One error to capture.
#[derive(Debug, Default, Clone)]
pub struct ErrorReport {
    pub exception_type: String,
    pub message: String,
    /// Route template (never a concrete path with ids or a query string).
    pub route: Option<String>,
    /// Source location, for panics.
    pub file: Option<String>,
    pub line: Option<u32>,
    /// `std::backtrace::Backtrace` text, for panics.
    pub backtrace: Option<String>,
    pub tags: Vec<(String, String)>,
}

/// Who is reporting.
#[derive(Debug, Clone, Default)]
pub struct Config {
    pub service: String,
    pub release: String,
    pub environment: Option<String>,
}

#[cfg(test)]
mod tests;
