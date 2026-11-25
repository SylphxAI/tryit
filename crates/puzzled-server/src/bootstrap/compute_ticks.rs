//! Compute schedule ticks (`[[compute.schedules]]` in sylphx.toml). Each tick
//! is admitted only with Compute's signed receipt for its exact URL
//! through `sylphx::auth::verify`, never a shared secret.

use axum::extract::{OriginalUri, State};
use axum::http::{header, HeaderMap, StatusCode};
use axum::response::{IntoResponse, Response};
use axum::Json;
use serde_json::json;
use sylphx::auth::verify::{Expect, Verifier, VerifyError};

use super::state::AppState;
use crate::capabilities::daily_pipeline;
use crate::capabilities::jobs::adapters::jobs_db;

pub const DAILY_PUZZLES_PATH: &str = "/internal/compute/daily-puzzles";
pub const AUDIT_RETENTION_PATH: &str = "/internal/compute/audit-log-retention";
pub const DAILY_REMINDERS_PATH: &str = "/internal/compute/daily-reminders";
pub const TRYIT_CONVERSIONS_PATH: &str = "/internal/compute/tryit-conversions";

/// Product transport mapping only; signature, claims and keys belong to the SDK.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum TickError {
    Missing,
    Invalid,
    Unavailable,
}

impl TickError {
    fn reason(self) -> &'static str {
        match self {
            Self::Missing => "tick_receipt_missing",
            Self::Invalid => "tick_receipt_invalid",
            Self::Unavailable => "tick_receipt_unavailable",
        }
    }

    fn response(self) -> (StatusCode, Json<serde_json::Value>) {
        let status = match self {
            Self::Missing | Self::Invalid => StatusCode::UNAUTHORIZED,
            Self::Unavailable => StatusCode::SERVICE_UNAVAILABLE,
        };
        (status, Json(json!({"error": self.reason()})))
    }
}

/// Verify the receipt against the exact callback URL; log only safe fields on rejection.
pub async fn admit_tick(jwks_url: &str, headers: &HeaderMap, path: &str) -> Result<(), TickError> {
    let token = headers
        .get(header::AUTHORIZATION)
        .and_then(|v| v.to_str().ok())
        .and_then(|v| v.strip_prefix("Bearer "))
        .map(str::trim)
        .filter(|t| !t.is_empty());
    verify_tick(jwks_url, headers, path, token)
        .await
        .map_err(|(reject, verify_error)| {
            // Do not echo a receipt copied into another diagnostic field.
            let safe = |value: &str| !token.is_some_and(|token| value.contains(token));
            let path = path.split('?').next().unwrap_or("-");
            tracing::warn!(
                reason = reject.reason(),
                verify_error,
                host = log_authority(headers.get(header::HOST))
                    .filter(|s| safe(s))
                    .unwrap_or("-"),
                forwarded_host = log_authority(headers.get("x-forwarded-host"))
                    .filter(|s| safe(s))
                    .unwrap_or("-"),
                forwarded_proto = headers
                    .get("x-forwarded-proto")
                    .and_then(|v| v.to_str().ok())
                    .filter(|s| matches!(*s, "http" | "https") && safe(s))
                    .unwrap_or("-"),
                path = if safe(path) { path } else { "-" },
                "compute tick rejected"
            );
            reject
        })
}

// Diagnostic projection only: reject arbitrary text, userinfo and overlong values.
fn log_authority(value: Option<&axum::http::HeaderValue>) -> Option<&str> {
    value.and_then(|v| v.to_str().ok()).filter(|s| {
        !s.is_empty()
            && s.len() <= 255
            && s.bytes()
                .all(|b| b.is_ascii_alphanumeric() || b".:-[]_".contains(&b))
    })
}

async fn verify_tick(
    jwks_url: &str,
    headers: &HeaderMap,
    path: &str,
    token: Option<&str>,
) -> Result<(), (TickError, &'static str)> {
    let token = token.ok_or((TickError::Missing, "not_checked"))?;
    // The edge preserves Host; forwarded-host is only a fallback for old routes.
    let host = headers
        .get(header::HOST)
        .or_else(|| headers.get("x-forwarded-host"))
        .and_then(|v| v.to_str().ok())
        .map(str::trim)
        .filter(|h| !h.is_empty())
        .ok_or((TickError::Invalid, "not_checked"))?;
    // The published SDK owns signature, issuer, audience, expiry and key
    // handling. Only the transport knows the original public request URL.
    Verifier::with_jwks_url(Expect::callback(format!("https://{host}{path}")), jwks_url)
        .verify(token)
        .await
        .map(|_| ())
        .map_err(|error| {
            // Keep only the variant: SDK payloads can contain untrusted claims
            // or dependency error details.
            let kind = match error {
                VerifyError::Malformed(_) => "malformed",
                VerifyError::Algorithm(_) => "algorithm",
                VerifyError::UnknownKey(_) => "unknown_key",
                VerifyError::Signature => "signature",
                VerifyError::Expired => "expired",
                VerifyError::Issuer(_) => "issuer",
                VerifyError::Audience => "audience",
                VerifyError::Keys(_) => "keys",
                VerifyError::Replayed => "replayed",
            };
            let reason = if matches!(error, VerifyError::Keys(_)) {
                TickError::Unavailable
            } else {
                TickError::Invalid
            };
            (reason, kind)
        })
}

/// Store every missing daily puzzle (14 days ahead, 30-day archive).
pub async fn daily_puzzles_tick(
    State(state): State<AppState>,
    OriginalUri(uri): OriginalUri,
    headers: HeaderMap,
) -> Response {
    if let Err(reject) = admit_tick(
        &state.tick_jwks_url,
        &headers,
        uri.path_and_query()
            .map(|p| p.as_str())
            .unwrap_or(uri.path()),
    )
    .await
    {
        return reject.response().into_response();
    }
    let Some(pool) = &state.pool else {
        return (
            StatusCode::SERVICE_UNAVAILABLE,
            Json(json!({"error": "no_database"})),
        )
            .into_response();
    };
    let today = puzzled_core::puzzle_play::daily_time::product_day_key(chrono::Utc::now());
    match daily_pipeline::fill(pool, today).await {
        Ok(report) => {
            let status = if report.failed.is_empty()
                && report.min_days_ahead >= daily_pipeline::ALERT_BELOW_DAYS
            {
                StatusCode::OK
            } else {
                // Compute retries a failed tick; the fill resumes where it stopped.
                StatusCode::SERVICE_UNAVAILABLE
            };
            (
                status,
                Json(json!({
                    "generated": report.generated,
                    "failed": report.failed.len(),
                    "min_days_ahead": report.min_days_ahead,
                })),
            )
                .into_response()
        }
        Err(error) => {
            tracing::warn!(%error, "daily puzzle tick failed");
            (
                StatusCode::SERVICE_UNAVAILABLE,
                Json(json!({"error": "fill_failed"})),
            )
                .into_response()
        }
    }
}

/// Strip IPs after 30 days and delete audit rows after a year.
pub async fn audit_retention_tick(
    State(state): State<AppState>,
    OriginalUri(uri): OriginalUri,
    headers: HeaderMap,
) -> Response {
    if let Err(reject) = admit_tick(
        &state.tick_jwks_url,
        &headers,
        uri.path_and_query()
            .map(|p| p.as_str())
            .unwrap_or(uri.path()),
    )
    .await
    {
        return reject.response().into_response();
    }
    let Some(pool) = &state.pool else {
        return (
            StatusCode::SERVICE_UNAVAILABLE,
            Json(json!({"error": "no_database"})),
        )
            .into_response();
    };
    match jobs_db::purge_audit_logs(pool).await {
        Ok((stripped, deleted)) => (
            StatusCode::OK,
            Json(json!({"stripped": stripped, "deleted": deleted})),
        )
            .into_response(),
        Err(error) => {
            tracing::warn!(%error, "audit-log retention tick failed");
            (
                StatusCode::SERVICE_UNAVAILABLE,
                Json(json!({"error": "retention_failed"})),
            )
                .into_response()
        }
    }
}
/// Retry the Tryit conversions still queued (a 503 or a failed send).
pub async fn tryit_conversions_tick(
    State(state): State<AppState>,
    OriginalUri(uri): OriginalUri,
    headers: HeaderMap,
) -> Response {
    if let Err(reject) = admit_tick(
        &state.tick_jwks_url,
        &headers,
        uri.path_and_query()
            .map(|p| p.as_str())
            .unwrap_or(uri.path()),
    )
    .await
    {
        return reject.response().into_response();
    }
    let (Some(pool), Some(reporter)) = (&state.pool, &state.tryit) else {
        // No database, or no SYLPHX_API_KEY: nothing can be sent yet.
        return (
            StatusCode::SERVICE_UNAVAILABLE,
            Json(json!({"error": "not_configured"})),
        )
            .into_response();
    };
    match crate::capabilities::tryit_conversions::sweep(pool, reporter).await {
        Ok(reported) => (StatusCode::OK, Json(json!({"reported": reported}))).into_response(),
        Err(error) => {
            tracing::warn!(%error, "tryit conversions tick failed");
            (
                StatusCode::SERVICE_UNAVAILABLE,
                Json(json!({"error": "sweep_failed"})),
            )
                .into_response()
        }
    }
}

/// Send the daily reminders that are due now, each at its player's own time.
pub async fn daily_reminders_tick(
    State(state): State<AppState>,
    OriginalUri(uri): OriginalUri,
    headers: HeaderMap,
) -> Response {
    if let Err(reject) = admit_tick(
        &state.tick_jwks_url,
        &headers,
        uri.path_and_query()
            .map(|p| p.as_str())
            .unwrap_or(uri.path()),
    )
    .await
    {
        return reject.response().into_response();
    }
    let Some(pool) = &state.pool else {
        return (
            StatusCode::SERVICE_UNAVAILABLE,
            Json(json!({"error": "no_database"})),
        )
            .into_response();
    };
    match super::connect_jobs::send_due_daily_reminders(pool, chrono::Utc::now()).await {
        Ok(sent) => (StatusCode::OK, Json(json!({"sent": sent}))).into_response(),
        Err(errors) => {
            tracing::warn!(failed = errors.len(), "daily reminders tick had failures");
            // Failed sends were released; Compute retries and they go out then.
            (
                StatusCode::SERVICE_UNAVAILABLE,
                Json(json!({"error": "send_failed", "failed": errors.len()})),
            )
                .into_response()
        }
    }
}

pub const METRICS_PATH: &str = "/internal/compute/product-metrics";
pub async fn metrics_tick(
    State(state): State<AppState>,
    OriginalUri(uri): OriginalUri,
    headers: HeaderMap,
) -> Response {
    if let Err(reject) = admit_tick(
        &state.tick_jwks_url,
        &headers,
        uri.path_and_query()
            .map(|p| p.as_str())
            .unwrap_or(uri.path()),
    )
    .await
    {
        return reject.response().into_response();
    }
    let Some(pool) = &state.pool else {
        return (
            StatusCode::SERVICE_UNAVAILABLE,
            Json(json!({"error":"no_database"})),
        )
            .into_response();
    };
    match crate::capabilities::metrics::rollup(pool, chrono::Utc::now()).await {
        Ok(days) => (StatusCode::OK, Json(json!({"days":days}))).into_response(),
        Err(_) => {
            crate::shared::signals::issue(
                crate::shared::signals::Kind::ToolFailed,
                "metrics_rollup",
                "rollup_failed",
            );
            (
                StatusCode::SERVICE_UNAVAILABLE,
                Json(json!({"error":"metrics_failed"})),
            )
                .into_response()
        }
    }
}
