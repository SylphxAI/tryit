use connectrpc::{
    ConnectError, ErrorCode, RequestContext, Response, ServiceRequest, ServiceResult,
};
use tracing::Instrument;
use uuid::Uuid;

use super::TRACE_TARGET;
use crate::bootstrap::identity::require_identity;
use crate::bootstrap::state::AppState;
use crate::capabilities::identity_access::adapters::auth_erasure::AuthErasure;
use crate::capabilities::preferences::adapters::account_deletion::{erase_player, EraseError};
use crate::proto::puzzled::v1::{DeleteAccountDataRequest, DeleteAccountDataResponse};

pub(super) async fn delete_account_data(
    state: &AppState,
    ctx: RequestContext,
    request: ServiceRequest<'_, DeleteAccountDataRequest>,
) -> ServiceResult<DeleteAccountDataResponse> {
    let identity = require_identity(&ctx)?;
    let req = request.to_owned_message();
    if req.confirm != "DELETE" {
        return Err(ConnectError::new(
            ErrorCode::InvalidArgument,
            "confirmation_required",
        ));
    }
    let Some(pool) = &state.pool else {
        return Err(ConnectError::new(
            ErrorCode::Unavailable,
            "account_deletion_unavailable",
        ));
    };
    // A subscription held in Money renews too: same rule. Money that
    // cannot answer refuses erasure (retryable) rather than erasing a
    // paying account.
    if let Some(money) = &state.money {
        match money
            .has_renewing_subscription_for_player(pool, &identity.user_id)
            .await
        {
            Ok(true) => {
                return Err(ConnectError::new(
                    ErrorCode::FailedPrecondition,
                    "cancel_subscription_first",
                ))
            }
            Ok(false) => {}
            Err(error) => {
                tracing::warn!(target: TRACE_TARGET, %error, "Money subscription check before erasure failed");
                return Err(ConnectError::new(
                    ErrorCode::Unavailable,
                    "account_deletion_unavailable",
                ));
            }
        }
    }
    // The player's rows are only half the person: the Sylphx Auth subject
    // is the sign-in they came in with, so deleting the rows alone would
    // leave a live sign-in behind a purged account (an erasure that is not
    // an erasure). `erase_player` deletes the rows and files Auth's
    // deletion inside one transaction and commits only after Auth
    // accepted. A database failure before Auth, or a definite Auth
    // refusal, rolls back and leaves the person whole and signed in to
    // retry (503). Transient database errors and ambiguous Auth answers
    // are retried in place. What still fails after Auth may have deleted
    // the sign-in keeps every row and the subject map, and is logged with
    // the subjects for `erase-player --subject` (500).
    let erasure = state.erasure.as_ref().ok_or_else(|| {
        tracing::error!(target: TRACE_TARGET, "account erasure refused: Enable Auth is not configured");
        ConnectError::new(ErrorCode::Unavailable, "identity_credential_unconfigured")
    })?;
    let player = Uuid::parse_str(&identity.user_id).map_err(|error| {
        tracing::warn!(target: TRACE_TARGET, %error, "account erasure: identity is not a player id");
        ConnectError::new(ErrorCode::Internal, "account_deletion_failed")
    })?;
    // The erase runs in its own task, which the handler only awaits. An
    // in-app erase can take tens of seconds (Auth retries with backoff);
    // a client or gateway that gives up drops this future, and an erase
    // running inside it would be cancelled mid-transaction — rolled back
    // after Auth may have accepted, with no "run erase-player" line. The
    // task owns everything it touches (a pool handle, the Auth handle,
    // the player id), so it runs to its commit or its logged failure
    // whatever the client does. The request's span goes with it, so its
    // log lines stay attributed to the request.
    let erase = crate::bootstrap::lifecycle::spawn_durable(
        erase_account(pool.clone(), player, erasure.clone()).in_current_span(),
    );
    erase.await.unwrap_or_else(|error| {
        tracing::error!(target: TRACE_TARGET, %error, "account erasure task failed; run erase-player --subject");
        Err(ConnectError::new(
            ErrorCode::Internal,
            "account_deletion_failed",
        ))
    })
}

/// Erase one account and its sign-in, and log the outcome. Owns its inputs so
/// it can run in a task that outlives the request.
async fn erase_account(
    pool: sqlx::PgPool,
    player: Uuid,
    erasure: AuthErasure,
) -> ServiceResult<DeleteAccountDataResponse> {
    match erase_player(&pool, player, Some(&erasure), None).await {
        Ok(erased) => {
            for (subject, request_id) in &erased.filed {
                tracing::info!(
                    target: TRACE_TARGET,
                    subject,
                    privacy_request_id = %request_id,
                    "sylphx auth account deletion requested"
                );
            }
            for subject in &erased.absent {
                tracing::info!(target: TRACE_TARGET, subject, "sylphx auth holds no account to delete");
            }
            tracing::info!(
                target: TRACE_TARGET,
                rows_deleted = erased.rows_deleted,
                attempts = erased.attempts,
                "account data erased"
            );
            Response::ok(DeleteAccountDataResponse {
                rows_deleted: erased.rows_deleted,
                ..Default::default()
            })
        }
        Err(EraseError::SignInRefused(error)) => {
            tracing::error!(target: TRACE_TARGET, %error, "sylphx auth account deletion refused; nothing erased");
            Err(ConnectError::new(
                ErrorCode::Unavailable,
                "identity_account_deletion_failed",
            ))
        }
        // Rolled back before Auth was asked: the account and its sign-in
        // are whole, and the person can repeat the request.
        Err(error) if !error.sign_in_may_be_deleted() => {
            tracing::warn!(target: TRACE_TARGET, %error, "account deletion failed; nothing erased");
            Err(ConnectError::new(
                ErrorCode::Unavailable,
                "account_deletion_unavailable",
            ))
        }
        // Auth may have deleted the sign-in but the rows were not
        // committed: the person may not be able to sign in to retry. The
        // subject map is intact; the operator finishes it by subject.
        Err(error) => {
            tracing::error!(
                target: TRACE_TARGET,
                %error,
                subjects = ?error.subjects(),
                "account erasure incomplete: sign-in may be deleted, rows remain; run erase-player --subject"
            );
            Err(ConnectError::new(
                ErrorCode::Internal,
                "account_deletion_failed",
            ))
        }
    }
}
