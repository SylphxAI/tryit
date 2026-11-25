use std::collections::hash_map::DefaultHasher;
use std::collections::HashMap;
use std::hash::{Hash, Hasher};
use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::{Mutex, OnceLock, PoisonError};
use std::time::{Duration, Instant};

use axum::extract::{MatchedPath, Request};
use axum::middleware::Next;
use axum::response::Response;
use sylphx::observability::CaptureErrorRequest;
use tokio::sync::mpsc;

use super::event::{error_event, fingerprint_key};
use super::{Config, ErrorReport};

/// The key's own org, project and environment.
pub const PARENT: &str = "orgs/-/projects/-/envs/-";
/// Route placeholder when no route template matched (never the raw path).
pub const UNMATCHED_ROUTE: &str = "unmatched";
const TIMEOUT: Duration = Duration::from_secs(3);
/// The same fingerprint is sent at most once per this window.
pub const RATE_WINDOW: Duration = Duration::from_secs(10);
/// Events waiting for the worker; more are dropped, never awaited.
pub const QUEUE_CAPACITY: usize = 64;
pub(super) const MAX_LIMITER_ENTRIES: usize = 1024;

// Keep existing tracing filters working after moving the reporter into a submodule.
const LOG_TARGET: &str = "puzzled_server::observability";

/// Lets one fingerprint through once per window. The clock is a parameter so
/// tests can tick it.
#[derive(Debug)]
pub struct RateLimiter {
    window: Duration,
    seen: HashMap<u64, Instant>,
}

impl RateLimiter {
    pub fn new(window: Duration) -> Self {
        Self {
            window,
            seen: HashMap::new(),
        }
    }

    /// True when the fingerprint may be sent at `now`.
    pub fn allow(&mut self, fingerprint: &str, now: Instant) -> bool {
        let mut hasher = DefaultHasher::new();
        fingerprint.hash(&mut hasher);
        let key = hasher.finish();
        if let Some(last) = self.seen.get(&key) {
            if now.saturating_duration_since(*last) < self.window {
                return false;
            }
        }
        if self.seen.len() >= MAX_LIMITER_ENTRIES {
            let window = self.window;
            self.seen
                .retain(|_, last| now.saturating_duration_since(*last) < window);
        }
        self.seen.insert(key, now);
        true
    }

    pub fn len(&self) -> usize {
        self.seen.len()
    }

    pub fn is_empty(&self) -> bool {
        self.seen.is_empty()
    }
}

/// Builds, scrubs and rate-limits events and queues them for the worker.
/// Not global: [`init`] stores one in a `OnceLock`, tests build their own.
#[derive(Debug)]
pub struct Reporter {
    config: Config,
    limiter: Mutex<RateLimiter>,
    queue: Option<mpsc::Sender<CaptureErrorRequest>>,
    dropped: AtomicU64,
    suppressed: AtomicU64,
}

impl Reporter {
    /// A reporter that only logs (no key).
    pub fn log_only(config: Config) -> Self {
        Self {
            config,
            limiter: Mutex::new(RateLimiter::new(RATE_WINDOW)),
            queue: None,
            dropped: AtomicU64::new(0),
            suppressed: AtomicU64::new(0),
        }
    }

    /// A reporter with a bounded queue; drain the receiver with [`run_worker`].
    pub fn with_queue(
        config: Config,
        capacity: usize,
    ) -> (Self, mpsc::Receiver<CaptureErrorRequest>) {
        let (tx, rx) = mpsc::channel(capacity);
        let mut reporter = Self::log_only(config);
        reporter.queue = Some(tx);
        (reporter, rx)
    }

    /// Events dropped because the queue was full.
    pub fn dropped_count(&self) -> u64 {
        self.dropped.load(Ordering::Relaxed)
    }

    /// Events skipped by the per-fingerprint rate limit.
    pub fn suppressed_count(&self) -> u64 {
        self.suppressed.load(Ordering::Relaxed)
    }

    /// Reports one error now. Never blocks, never fails; callable from any thread.
    pub fn report(&self, report: &ErrorReport) {
        self.report_at(report, Instant::now());
    }

    /// [`Self::report`] with an explicit clock.
    pub fn report_at(&self, report: &ErrorReport, now: Instant) {
        let event = error_event(report, &self.config);
        tracing::error!(
            target: LOG_TARGET,
            exception_type = %event.exception_type,
            route = ?report.route,
            "{}",
            event.message
        );
        let Some(queue) = &self.queue else { return };
        let allowed = self
            .limiter
            .lock()
            .unwrap_or_else(PoisonError::into_inner)
            .allow(&fingerprint_key(&event), now);
        if !allowed {
            let total = self.suppressed.fetch_add(1, Ordering::Relaxed) + 1;
            tracing::debug!(target: LOG_TARGET, suppressed = total, "observability capture rate limited");
            return;
        }
        let mut request = CaptureErrorRequest::default();
        request.parent = PARENT.to_owned();
        request.error_event = Some(event);
        if queue.try_send(request).is_err() {
            let total = self.dropped.fetch_add(1, Ordering::Relaxed) + 1;
            tracing::warn!(
                target: LOG_TARGET,
                dropped = total,
                "observability queue full or closed; event dropped"
            );
        }
    }
}

/// Sends queued events one at a time until every sender is gone.
pub async fn run_worker(client: sylphx::Client, mut queue: mpsc::Receiver<CaptureErrorRequest>) {
    while let Some(request) = queue.recv().await {
        let observability = client.observability();
        let groups = observability.error_groups();
        let call = groups.capture(request);
        match tokio::time::timeout(TIMEOUT + Duration::from_secs(1), call).await {
            Ok(Ok(_)) => {}
            Ok(Err(error)) => {
                tracing::warn!(target: LOG_TARGET, %error, "observability capture failed")
            }
            Err(_) => tracing::warn!(target: LOG_TARGET, "observability capture timed out"),
        }
    }
}

/// An SDK client for `key`; `base_url` defaults to api.sylphx.com.
pub fn client(key: &str, base_url: Option<&str>) -> Option<sylphx::Client> {
    let mut builder = sylphx::HttpTransport::builder()
        .api_key(key)
        .timeout(TIMEOUT)
        .max_retries(1);
    if let Some(url) = base_url {
        builder = builder.base_url(url);
    }
    builder
        .build()
        .map(sylphx::Client::new)
        .map_err(
            |error| tracing::warn!(target: LOG_TARGET, %error, "observability client not built"),
        )
        .ok()
}

static REPORTER: OnceLock<Reporter> = OnceLock::new();

fn env(name: &str) -> Option<String> {
    std::env::var(name)
        .ok()
        .map(|v| v.trim().to_owned())
        .filter(|v| !v.is_empty())
}

/// Reads the platform environment, starts the worker and installs the panic
/// hook. Call once at startup, inside the tokio runtime.
pub fn init() {
    let config = Config {
        service: env("SYLPHX_SERVICE_NAME").unwrap_or_else(|| "api".to_owned()),
        release: env("SYLPHX_GIT_COMMIT_SHA").unwrap_or_default(),
        environment: env("SYLPHX_ENVIRONMENT_TYPE"),
    };
    let client = env("SYLPHX_API_KEY").and_then(|key| client(&key, None));
    let reporter = match (client, tokio::runtime::Handle::try_current()) {
        (Some(client), Ok(runtime)) => {
            let (reporter, queue) = Reporter::with_queue(config, QUEUE_CAPACITY);
            runtime.spawn(run_worker(client, queue));
            reporter
        }
        _ => {
            tracing::warn!(target: LOG_TARGET, "observability capture off: SYLPHX_API_KEY is not set");
            Reporter::log_only(config)
        }
    };
    if REPORTER.set(reporter).is_err() {
        return;
    }
    let previous = std::panic::take_hook();
    std::panic::set_hook(Box::new(move |info| {
        let message = info
            .payload()
            .downcast_ref::<&str>()
            .map(|s| (*s).to_owned())
            .or_else(|| info.payload().downcast_ref::<String>().cloned())
            .unwrap_or_else(|| "panic".to_owned());
        capture(&ErrorReport {
            exception_type: "panic".to_owned(),
            message,
            file: info.location().map(|l| l.file().to_owned()),
            line: info.location().map(|l| l.line()),
            backtrace: Some(std::backtrace::Backtrace::force_capture().to_string()),
            ..ErrorReport::default()
        });
        previous(info);
    }));
}

/// Captures one error through the global reporter. Never blocks, never fails.
pub fn capture(report: &ErrorReport) {
    if let Some(reporter) = REPORTER.get() {
        reporter.report(report);
    }
}

/// Axum middleware: captures every 5xx response (route template and status only).
pub async fn capture_server_errors(request: Request, next: Next) -> Response {
    observe(REPORTER.get(), request, next).await
}

pub(super) async fn observe(reporter: Option<&Reporter>, request: Request, next: Next) -> Response {
    let method = request.method().clone();
    let route = request
        .extensions()
        .get::<MatchedPath>()
        .map_or(UNMATCHED_ROUTE, |p| {
            p.as_str()
                .split(['?', '#'])
                .next()
                .unwrap_or(UNMATCHED_ROUTE)
        })
        .to_owned();
    let response = next.run(request).await;
    let status = response.status();
    if status.is_server_error() {
        if let Some(reporter) = reporter {
            reporter.report(&ErrorReport {
                exception_type: format!("HTTP {}", status.as_u16()),
                message: format!("{method} {route} returned {status}"),
                route: Some(route),
                tags: vec![("status".to_owned(), status.as_u16().to_string())],
                ..ErrorReport::default()
            });
        }
    }
    response
}
