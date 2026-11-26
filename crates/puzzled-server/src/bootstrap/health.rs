//! Public liveness and readiness probes (not product capability proof).

use std::sync::Arc;
use std::time::Duration;

use axum::extract::State;
use axum::http::{header, StatusCode};
use axum::response::{IntoResponse, Response};
use axum::Json;
use serde::Serialize;
use sqlx::postgres::PgConnectOptions;
use sqlx::{Connection, PgConnection, PgPool};
use tokio::sync::Mutex;
use tokio::time::timeout;

use super::lifecycle::shutting_down;
use crate::shared::db_config::is_writer;

// Leave time to return the HTTP response before Knative's 1s probe deadline.
const READINESS_BUDGET: Duration = Duration::from_millis(800);

#[derive(Clone)]
pub(super) struct WriterReadiness {
    options: Arc<PgConnectOptions>,
    connection: Arc<Mutex<Option<PgConnection>>>,
}

impl WriterReadiness {
    pub(super) fn new(request_pool: &PgPool) -> Self {
        Self {
            options: request_pool.connect_options(),
            connection: Arc::new(Mutex::new(None)),
        }
    }

    // One lazy, reusable connection per API instance; no pool checkout or
    // client-side idle/lifetime expiry. Never return a cached writer verdict.
    async fn check(&self) -> Result<bool, sqlx::Error> {
        let mut slot = self.connection.lock().await;
        if let Some(mut connection) = slot.take() {
            // Reserve most of the deadline for a reconnect if the socket died.
            if let Ok(Ok(writable)) =
                timeout(READINESS_BUDGET / 4, is_writer(&mut connection)).await
            {
                if writable {
                    *slot = Some(connection);
                }
                return Ok(writable);
            }
            // Drop the failed socket before opening a replacement. If the
            // outer deadline cancels either query, its socket is discarded.
        }
        let mut connection = PgConnection::connect_with(&self.options).await?;
        let writable = is_writer(&mut connection).await?;
        if writable {
            *slot = Some(connection);
        }
        Ok(writable)
    }
}

#[derive(Serialize)]
struct HealthBody {
    status: &'static str,
}

fn probe_response(ok: bool) -> Response {
    let (code, status) = if ok {
        (StatusCode::OK, "ok")
    } else {
        (StatusCode::SERVICE_UNAVAILABLE, "not_ready")
    };
    (
        code,
        [(header::CACHE_CONTROL, "no-store")],
        Json(HealthBody { status }),
    )
        .into_response()
}

pub(crate) async fn healthz() -> Response {
    probe_response(!shutting_down())
}

pub(super) async fn readyz(State(writer): State<Option<WriterReadiness>>) -> Response {
    if shutting_down() {
        return probe_response(false);
    }

    let ready = if let Some(writer) = writer {
        matches!(
            timeout(READINESS_BUDGET, writer.check()).await,
            Ok(Ok(true))
        )
    } else {
        false
    };
    probe_response(ready)
}
