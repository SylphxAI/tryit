//! One erasure attempt, from identity locking through Auth and commit.

use sqlx::PgPool;
use uuid::Uuid;

use crate::capabilities::identity_access::adapters::auth_erasure::AuthErasure;
use crate::capabilities::identity_access::adapters::{auth_subjects, guest_credentials};

use super::{Failure, SignInState, USER_KEYED_COLUMNS};

pub(super) async fn erase_once(
    pool: &PgPool,
    uid: Uuid,
    sign_in: Option<&AuthErasure>,
    named_subject: Option<&str>,
    state: &mut SignInState,
) -> Result<u64, Failure> {
    let mut tx = pool.begin().await.map_err(Failure::at("begin"))?;
    let linked: Vec<Uuid> = sqlx::query_scalar(
        "SELECT user_id FROM guest_credentials WHERE adopted_user_id = $1 ORDER BY user_id",
    )
    .bind(uid)
    .fetch_all(&mut *tx)
    .await
    .map_err(Failure::at("guest_credentials"))?;
    let mut players = vec![uid];
    players.extend(linked.iter().copied());
    guest_credentials::lock_players(&mut tx, players.clone())
        .await
        .map_err(Failure::at("lock"))?;
    let locked_linked: Vec<Uuid> = sqlx::query_scalar(
        "SELECT user_id FROM guest_credentials WHERE adopted_user_id = $1 ORDER BY user_id",
    )
    .bind(uid)
    .fetch_all(&mut *tx)
    .await
    .map_err(Failure::at("guest_credentials"))?;
    if linked != locked_linked {
        let _ = tx.rollback().await;
        return Err(Failure::IdentitySetChanged);
    }
    // Read under the lock and before the map rows are deleted below.
    let mut subjects = auth_subjects::recorded_subjects(&mut tx, uid)
        .await
        .map_err(Failure::at("auth_subjects"))?;
    // No row and nothing settled yet: the player predates the map, and the
    // old form is the only handle Auth knows. (Once a subject was settled, an
    // empty map means an earlier attempt's commit landed after all.)
    if subjects.is_empty() && !state.any_settled() {
        subjects.push(format!("principal-{uid}"));
    }
    if let Some(named) = named_subject {
        if !subjects.iter().any(|s| s == named) {
            subjects.push(named.to_string());
        }
    }
    let mut deleted = 0u64;
    // Registry rows are last: never erase the only source-guest linkage
    // before visiting its collision rows, freezes, and adoption trails.
    for credentials in [false, true] {
        for player in &players {
            for (table, _column, statement) in USER_KEYED_COLUMNS {
                if (*table == "guest_credentials") != credentials {
                    continue;
                }
                let result = sqlx::query(*statement)
                    .bind(player)
                    .execute(&mut *tx)
                    .await
                    .map_err(Failure::at(table))?;
                deleted += result.rows_affected();
            }
        }
    }
    // No subject or request id is logged here: the operator job's output
    // carries no ids. The api logs them from the result.
    if let Some(auth) = sign_in {
        for subject in subjects {
            if state.settled(&subject) {
                continue;
            }
            state.asked.insert(subject.clone());
            match auth.delete_principal(&subject).await {
                Ok(Some(request_id)) => state.filed.push((subject, request_id)),
                // Auth holds no such account (already deleted, or never
                // created): the person has nothing left to sign in with.
                Ok(None) => state.absent.push(subject),
                Err(error) => {
                    let _ = tx.rollback().await;
                    return Err(Failure::SignIn(error));
                }
            }
        }
    }
    tx.commit().await.map_err(Failure::at("commit"))?;
    Ok(deleted)
}
