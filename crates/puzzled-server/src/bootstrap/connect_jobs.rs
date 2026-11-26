//! Native Connect JobsService — the app's sole scheduled-work executor.
//!
//! Inbound: SDK-verified Compute callback receipt (`Authorization: Bearer`).
//! Effects: dest Events `POST /v1/deliveries` (push + email).

use std::sync::Arc;

use chrono::Utc;
use connectrpc::{
    ConnectError, ErrorCode, RequestContext, Response, ServiceRequest, ServiceResult,
};

use super::compute_ticks::{admit_tick, TickError};
use super::state::AppState;
use crate::capabilities::jobs::adapters::jobs_db;
use crate::proto::puzzled::v1::{JobsService, RunRetentionJobRequest, RunRetentionJobResponse};

mod daily_reminders;
mod win_back;

pub(crate) use daily_reminders::send_due_daily_reminders_with;

/// Send the daily reminders due at `now`, each at the player's own reminder
/// time in their own time zone (see [`jobs_db::claim_due_daily_reminders`]).
/// Completed reminders suppress later ticks on the same local day. Leases
/// recover interrupted workers; delivery-before-ack crashes may duplicate a
/// reminder (at-least-once). Finished players are excluded when claimed.
pub async fn send_due_daily_reminders(
    pool: &sqlx::PgPool,
    now: chrono::DateTime<Utc>,
) -> Result<u32, Vec<String>> {
    send_due_daily_reminders_with(pool, now, |user_id, deadline| async move {
        crate::capabilities::preferences::adapters::web_push::send_daily(pool, &user_id, deadline)
            .await
    })
    .await
}

#[derive(Clone)]
pub struct JobsConnectService {
    state: AppState,
}

impl JobsConnectService {
    pub fn new(state: AppState) -> Self {
        Self { state }
    }

    /// Admit a scheduled call: Compute's signed tick receipt for this exact
    /// URL. The Events product key used before was never set in production,
    /// so every call was refused; a shared bearer is not an admission.
    async fn admit_tick(&self, ctx: &RequestContext) -> Result<(), ConnectError> {
        // The procedure path alone drops the query. Axum preserves the exact
        // original URI in extensions before Connect dispatches the request.
        let uri = &ctx
            .extensions()
            .get::<axum::extract::OriginalUri>()
            .ok_or_else(|| ConnectError::new(ErrorCode::Unauthenticated, "tick_receipt_invalid"))?
            .0;
        admit_tick(
            &self.state.tick_jwks_url,
            ctx.headers(),
            uri.path_and_query()
                .map(|p| p.as_str())
                .unwrap_or(uri.path()),
        )
        .await
        .map_err(|error| match error {
            TickError::Unavailable => {
                ConnectError::new(ErrorCode::Unavailable, "tick_receipt_unavailable")
            }
            _ => ConnectError::new(ErrorCode::Unauthenticated, "tick_receipt_invalid"),
        })
    }

    async fn run_daily_reminder(&self) -> Result<u32, Vec<String>> {
        let Some(pool) = &self.state.pool else {
            return Err(vec!["no database pool".to_string()]);
        };
        send_due_daily_reminders(pool, Utc::now()).await
    }
}

#[allow(refining_impl_trait_internal, refining_impl_trait_reachable)]
impl JobsService for JobsConnectService {
    async fn run_retention_job(
        &self,
        ctx: RequestContext,
        request: ServiceRequest<'_, RunRetentionJobRequest>,
    ) -> ServiceResult<RunRetentionJobResponse> {
        self.admit_tick(&ctx).await?;
        let req = request.to_owned_message();
        let (ok, processed, errors) = match req.name.trim() {
            "daily-reminder" => match self.run_daily_reminder().await {
                Ok(n) => (true, n, Vec::new()),
                Err(errors) => (false, 0, errors),
            },
            "win-back-emails" => match win_back::run_win_back_emails(&self.state).await {
                Ok(n) => (true, n, Vec::new()),
                Err(errors) => (false, 0, errors),
            },
            "audit-log-retention" => match &self.state.pool {
                Some(pool) => match jobs_db::purge_audit_logs(pool).await {
                    Ok((stripped, deleted)) => (
                        true,
                        u32::try_from(stripped + deleted).unwrap_or(u32::MAX),
                        Vec::new(),
                    ),
                    Err(error) => (false, 0, vec![error]),
                },
                None => (false, 0, vec!["no database pool".to_string()]),
            },
            other => {
                return Err(ConnectError::new(
                    ErrorCode::InvalidArgument,
                    format!("unknown job: {other}"),
                ));
            }
        };
        Response::ok(RunRetentionJobResponse {
            ok,
            processed,
            errors,
            ..Default::default()
        })
    }
}

pub fn jobs_connect_service(state: AppState) -> Arc<JobsConnectService> {
    Arc::new(JobsConnectService::new(state))
}

#[cfg(test)]
mod tests;
