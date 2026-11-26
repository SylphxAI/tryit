//! Opt-in timing for Connect operators. Counters hold only durations and counts.

use std::cell::RefCell;
use std::future::Future;
use std::time::Instant;

use axum::http::{header, Request};
use axum::{body::Body, middleware::Next, response::Response};
use sqlx::{PgPool, Postgres, Transaction};
use tracing::field::{Field, Visit};
use tracing::{Event, Metadata, Subscriber};
use tracing_subscriber::filter::dynamic_filter_fn;
use tracing_subscriber::layer::{Context, Layer};

#[derive(Default)]
struct Timing {
    admission: f64,
    db: f64,
    round_trips: u32,
    acquire: f64,
    checkouts: u32,
    writer_probe: f64,
    token_lock: f64,
    player_lock: f64,
    money: f64,
    money_calls: u32,
}

tokio::task_local! { static TIMING: RefCell<Timing>; }

pub(crate) async fn observe(request: Request<Body>, next: Next) -> Response {
    let headers = request.headers();
    if !request.uri().path().starts_with("/puzzled.v1.")
        || headers.get("x-puzzled-verification").map(|v| v.as_bytes()) != Some(b"1")
        || headers.get_all("x-puzzled-verification").iter().count() != 1
    {
        return next.run(request).await;
    }
    let start = Instant::now();
    TIMING.scope(RefCell::default(), async move {
        let mut response = next.run(request).await;
        let value = TIMING.with(|timing| {
            let t = timing.borrow();
            // The probe is included in both acquire and db. Remove its overlap.
            let wall = ms(start);
            let db_wall = t.db + (t.acquire - t.writer_probe).max(0.0);
            format!(
                r#"handler;dur={wall:.2}, admission;dur={:.2}, handler_db;dur={:.2}, db;dur={:.2}, round_trips;desc="{}", acquire;dur={:.2}, checkouts;desc="{}", acquire_other;dur={:.2}, token_lock;dur={:.2}, player_lock;dur={:.2}, money;dur={:.2}, money_calls;desc="{}", other;dur={:.2}"#,
                t.admission, db_wall, t.db, t.round_trips, t.acquire, t.checkouts,
                (t.acquire - t.writer_probe).max(0.0), t.token_lock, t.player_lock, t.money,
                t.money_calls, (wall - db_wall - t.money).max(0.0),
            )
        });
        if let Ok(value) = value.parse() {
            response.headers_mut().insert("server-timing", value);
            response.headers_mut().insert(header::CACHE_CONTROL, axum::http::HeaderValue::from_static("private, no-store"));
            response.headers_mut().insert("cdn-cache-control", axum::http::HeaderValue::from_static("no-store"));
        }
        response
    }).await
}

fn ms(start: Instant) -> f64 {
    start.elapsed().as_secs_f64() * 1000.0
}

pub(crate) async fn admission<T>(future: impl Future<Output = T>) -> T {
    measure(future, |timing, elapsed| timing.admission += elapsed).await
}

/// Count actual uncached SDK requests, including environment discovery.
pub(crate) async fn money<T>(future: impl Future<Output = T>) -> T {
    measure(future, |timing, elapsed| {
        timing.money += elapsed;
        timing.money_calls += 1;
    })
    .await
}

async fn measure<T>(future: impl Future<Output = T>, record: impl FnOnce(&mut Timing, f64)) -> T {
    let start = TIMING.try_with(|_| Instant::now()).ok();
    let result = future.await;
    if let Some(start) = start {
        let _ = TIMING.try_with(|timing| record(&mut timing.borrow_mut(), ms(start)));
    }
    result
}

/// sqlx 0.9 sends BEGIN without a query event. Keep the same checked pool
/// acquisition, then time the existing sqlx transaction start separately.
pub(crate) async fn begin(pool: &PgPool) -> Result<Transaction<'static, Postgres>, sqlx::Error> {
    if TIMING.try_with(|_| ()).is_err() {
        return pool.begin().await;
    }
    let connection = pool.acquire().await?;
    measure(Transaction::begin(connection, None), |timing, elapsed| {
        timing.round_trips += 1;
        timing.db += elapsed;
    })
    .await
}

/// Subscribe only inside an opted-in request, independently of the log filter.
/// sqlx's statement durations include cold prepares and lock waits. Its events
/// do not report the number of pgwire prepare exchanges: round_trips counts
/// statement executions, not protocol messages. No SQL text is retained.
pub fn db_layer<S: Subscriber + for<'a> tracing_subscriber::registry::LookupSpan<'a>>(
) -> impl Layer<S> {
    DbTiming.with_filter(
        dynamic_filter_fn(|m, _| db_event(m) && TIMING.try_with(|_| ()).is_ok())
            .with_callsite_filter(|m| {
                if db_event(m) {
                    tracing::subscriber::Interest::sometimes()
                } else {
                    tracing::subscriber::Interest::never()
                }
            }),
    )
}

fn db_event(meta: &Metadata<'_>) -> bool {
    meta.is_event() && matches!(meta.target(), "sqlx::query" | "sqlx::pool::acquire")
}

struct DbTiming;

impl<S: Subscriber> Layer<S> for DbTiming {
    fn on_event(&self, event: &Event<'_>, _: Context<'_, S>) {
        let _ = TIMING.try_with(|timing| {
            let mut fields = DbFields::default();
            event.record(&mut fields);
            let mut t = timing.borrow_mut();
            let elapsed = fields.seconds * 1000.0;
            if event.metadata().target() == "sqlx::pool::acquire" {
                t.acquire += elapsed;
                t.checkouts += 1;
            } else {
                t.db += elapsed;
                t.round_trips += 1;
                if fields.writer_probe {
                    t.writer_probe += elapsed;
                }
                if fields.token_lock {
                    t.token_lock += elapsed;
                }
                if fields.player_lock {
                    t.player_lock += elapsed;
                }
            }
        });
    }
}

#[derive(Default)]
struct DbFields {
    seconds: f64,
    writer_probe: bool,
    token_lock: bool,
    player_lock: bool,
}

impl Visit for DbFields {
    fn record_f64(&mut self, field: &Field, value: f64) {
        if matches!(field.name(), "elapsed_secs" | "acquired_after_secs") {
            self.seconds = value;
        }
    }

    fn record_str(&mut self, field: &Field, sql: &str) {
        if matches!(field.name(), "db.statement" | "summary") && !sql.trim().is_empty() {
            let sql = sql.trim();
            self.writer_probe = sql.starts_with("SELECT NOT pg_is_in_recovery()");
            let is_lock = sql.contains("pg_advisory_xact_lock");
            self.token_lock = is_lock && sql.contains("'puzzled:guest-token:'");
            self.player_lock = is_lock && !self.token_lock;
        }
    }

    fn record_debug(&mut self, _: &Field, _: &dyn std::fmt::Debug) {}
}
