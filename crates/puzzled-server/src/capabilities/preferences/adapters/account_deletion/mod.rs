//! Self-serve erasure: delete every row keyed to one player.
//!
//! `USER_KEYED_COLUMNS` is the whole list of (table, column) pairs that hold a
//! player id. A test reads the Atlas migrations and fails when a table gains a
//! player-id column that is not listed here, so a new table cannot be left out
//! of erasure silently.

mod rows;
mod transaction;

#[cfg(test)]
mod tests;

use std::collections::BTreeSet;
use std::time::Duration;

use sqlx::PgPool;
use uuid::Uuid;

use crate::capabilities::identity_access::adapters::auth_erasure::{AuthErasure, AuthError};

use transaction::erase_once;

pub use rows::{count_account_data, USER_KEYED_COLUMNS};

/// How many times one erasure runs its transaction before it reports a
/// database failure, and the pause before each retry. Bounded and short: the
/// person is waiting on the request.
const ATTEMPTS: usize = 4;
const BACKOFF: [Duration; ATTEMPTS - 1] = [
    Duration::from_millis(100),
    Duration::from_millis(400),
    Duration::from_millis(1600),
];

/// A finished erasure: rows deleted (by the attempt that committed), the
/// Auth requests accepted (subject, request id) and the subjects Auth no
/// longer held. Subjects are for the api's own log; the operator job prints
/// counts only.
#[derive(Debug, Default, Clone, PartialEq, Eq)]
pub struct Erased {
    pub rows_deleted: u64,
    pub filed: Vec<(String, String)>,
    pub absent: Vec<String>,
    pub attempts: usize,
}

/// Why an erasure did not finish. Every variant leaves the player's rows
/// whole, the subject map included: the deletes run in one transaction that
/// never committed. What differs is the sign-in.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum EraseError {
    /// Auth definitely refused (a 4xx it decided on) before it accepted any
    /// subject of this erasure: the account and its sign-in are whole and the
    /// person can repeat the request.
    SignInRefused(String),
    /// The sign-in may already be deleted while the rows remain: Auth stayed
    /// ambiguous (no answer, timeout, 5xx, 408, 429) through every attempt,
    /// or refused one subject after accepting another. The person may not be
    /// able to sign in to retry: `erase-player --subject` finishes it.
    /// `subjects` are those this erasure named to Auth.
    SignInMaybeDeleted {
        error: String,
        subjects: Vec<String>,
    },
    /// The database failed every attempt (or a non-transient error). When
    /// `sign_in_may_be_deleted` is true Auth had accepted (or no longer held)
    /// a subject before the commit failed: `erase-player --subject` finishes
    /// it. Otherwise nothing was asked of Auth and the person can retry.
    Database {
        error: String,
        sign_in_may_be_deleted: bool,
        subjects: Vec<String>,
    },
}

impl EraseError {
    /// The person may have lost their sign-in with their rows still here.
    #[must_use]
    pub fn sign_in_may_be_deleted(&self) -> bool {
        match self {
            Self::SignInRefused(_) => false,
            Self::SignInMaybeDeleted { .. } => true,
            Self::Database {
                sign_in_may_be_deleted,
                ..
            } => *sign_in_may_be_deleted,
        }
    }

    /// The subjects this erasure named to Auth (empty when none was asked).
    #[must_use]
    pub fn subjects(&self) -> &[String] {
        match self {
            Self::SignInRefused(_) => &[],
            Self::SignInMaybeDeleted { subjects, .. } | Self::Database { subjects, .. } => subjects,
        }
    }
}

impl std::fmt::Display for EraseError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            Self::SignInRefused(error) => write!(f, "sign-in deletion refused: {error}"),
            Self::SignInMaybeDeleted { error, .. } => {
                write!(f, "sign-in deletion unconfirmed: {error}")
            }
            Self::Database {
                error,
                sign_in_may_be_deleted,
                ..
            } => write!(
                f,
                "account deletion failed (sign-in may be deleted: {sign_in_may_be_deleted}): {error}"
            ),
        }
    }
}

/// A database failure worth repeating the whole transaction for: the
/// connection dropped (the 2026-10-02 `Connection reset by peer`), the pool
/// timed out, the server restarted or failed over, or Postgres asked for a
/// retry (serialization failure, deadlock). Anything else is a real refusal.
#[must_use]
pub fn is_transient(error: &sqlx::Error) -> bool {
    match error {
        sqlx::Error::Io(_) | sqlx::Error::PoolTimedOut | sqlx::Error::WorkerCrashed => true,
        sqlx::Error::Database(db) => db.code().is_some_and(|code| {
            matches!(
                code.as_ref(),
                "40001" | "40P01" | "57P01" | "57P02" | "57P03"
            ) || code.starts_with("08")
        }),
        _ => false,
    }
}

/// One attempt's failure, before the retry policy reads it.
enum Failure {
    Database(sqlx::Error, &'static str),
    IdentitySetChanged,
    SignIn(AuthError),
}

impl Failure {
    fn at(table: &'static str) -> impl FnOnce(sqlx::Error) -> Self {
        move |error| Self::Database(error, table)
    }
}

/// What Auth has been told across attempts. `asked` holds every subject a
/// request was sent for (accepted, absent, or unanswered).
#[derive(Default)]
struct SignInState {
    filed: Vec<(String, String)>,
    absent: Vec<String>,
    asked: BTreeSet<String>,
}

impl SignInState {
    fn settled(&self, subject: &str) -> bool {
        self.filed.iter().any(|(s, _)| s == subject) || self.absent.iter().any(|s| s == subject)
    }

    fn any_settled(&self) -> bool {
        !self.filed.is_empty() || !self.absent.is_empty()
    }
}

/// Erase an account and its adopted source guests, and (when `sign_in` is
/// given) the person's Sylphx Auth sign-in, as one unit.
///
/// Order, inside ONE transaction: lock the identity set, read the Auth
/// subjects that name the player, delete every player-keyed row (the subject
/// map included), then file Auth's deletion for each subject, then commit.
/// So:
/// - a database failure before Auth is called rolls everything back and the
///   person can still sign in and retry;
/// - a definite Auth refusal before any subject was accepted rolls the
///   deletes back, so no live sign-in is left on an empty account;
/// - an ambiguous Auth answer (no answer, timeout, 5xx, 408, 429) and a
///   transient database error both repeat the whole transaction, with a short
///   bounded backoff; Auth's idempotency key is fixed per subject, so asking
///   again is safe, and a subject Auth already accepted is not asked again;
/// - what still fails after Auth may have deleted the sign-in leaves the rows
///   and the subject map whole, and is reported as such so the caller can
///   point the operator at `erase-player --subject`.
///
/// `named_subject` adds a subject the caller knows (an operator's
/// `--subject`) to those the map records.
pub async fn erase_player(
    pool: &PgPool,
    player: Uuid,
    sign_in: Option<&AuthErasure>,
    named_subject: Option<&str>,
) -> Result<Erased, EraseError> {
    let mut state = SignInState::default();
    let mut last = String::from("account deletion identity set changed");
    // The last failure was an ambiguous Auth answer / any attempt had one.
    let mut auth_unconfirmed = false;
    let mut ever_ambiguous = false;
    for attempt in 1..=ATTEMPTS {
        let outcome = erase_once(pool, player, sign_in, named_subject, &mut state).await;
        let retry = match outcome {
            Ok(rows_deleted) => {
                return Ok(Erased {
                    rows_deleted,
                    filed: state.filed,
                    absent: state.absent,
                    attempts: attempt,
                });
            }
            Err(Failure::SignIn(AuthError::Refused(error))) => {
                // Refused before anything was accepted: nothing changed.
                if !state.any_settled() && !ever_ambiguous {
                    return Err(EraseError::SignInRefused(error));
                }
                return Err(EraseError::SignInMaybeDeleted {
                    error,
                    subjects: state.asked.into_iter().collect(),
                });
            }
            Err(Failure::SignIn(AuthError::Ambiguous(error))) => {
                auth_unconfirmed = true;
                ever_ambiguous = true;
                last = error;
                tracing::warn!(attempt, error = %last, "sylphx auth deletion unconfirmed; retrying");
                true
            }
            Err(Failure::IdentitySetChanged) => {
                last = "account deletion identity set changed".into();
                true
            }
            Err(Failure::Database(error, table)) => {
                let retry = is_transient(&error);
                auth_unconfirmed = false;
                last = format!("account deletion failed on {table}: {error}");
                if retry {
                    tracing::warn!(attempt, error = %last, "account erasure attempt failed; retrying");
                }
                retry
            }
        };
        if !retry {
            break;
        }
        if let Some(pause) = BACKOFF.get(attempt - 1) {
            tokio::time::sleep(*pause).await;
        }
    }
    let subjects: Vec<String> = state.asked.iter().cloned().collect();
    if auth_unconfirmed {
        return Err(EraseError::SignInMaybeDeleted {
            error: last,
            subjects,
        });
    }
    Err(EraseError::Database {
        error: last,
        sign_in_may_be_deleted: !state.asked.is_empty(),
        subjects,
    })
}

/// Erase an account's rows only (no Auth call). The platform's erasure
/// delivery starts at Auth, so its handler needs only this half.
pub async fn delete_account_data(pool: &PgPool, user_id: &str) -> Result<u64, String> {
    let uid = Uuid::parse_str(user_id).map_err(|e| format!("invalid user id: {e}"))?;
    erase_player(pool, uid, None, None)
        .await
        .map(|erased| erased.rows_deleted)
        .map_err(|error| error.to_string())
}
