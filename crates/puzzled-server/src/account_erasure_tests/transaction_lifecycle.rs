//! Erasure transaction retries, rollback, and survival after client disconnect.

use std::sync::{Arc, Mutex};

use axum::http::StatusCode;
use sqlx::PgPool;
use uuid::Uuid;

use super::fixtures::{
    accepted, app, delete_account, erase_player_command, message, preference_rows, seed,
    spawn_auth, subject_rows, StubAuth,
};
use crate::capabilities::identity_access::adapters::platform_jwt::test_key_lock;
use crate::test_support::{fresh_database, token};

// --- Robustness: a database that fails mid-erasure (2026-10-02 incident) ---
//
// Faults are real server-side failures, not mocks: a trigger on
// `notification_preferences` terminates its own backend, so the api sees the
// connection die exactly as it did in production. `deferred` fires the
// trigger at COMMIT (after Auth accepted); otherwise it fires on the DELETE
// (before Auth is asked). The first `times` firings fail; a sequence counts
// them because it survives the rollback.

async fn inject_fault(pool: &PgPool, deferred: bool, times: i64) {
    sqlx::raw_sql(sqlx::AssertSqlSafe(format!(
        "CREATE SEQUENCE erasure_fault;
         CREATE FUNCTION erasure_fault() RETURNS trigger LANGUAGE plpgsql AS $$
         BEGIN
           IF nextval('erasure_fault') <= {times} THEN
             PERFORM pg_terminate_backend(pg_backend_pid());
           END IF;
           RETURN OLD;
         END $$;
         {trigger}",
        trigger = if deferred {
            "CREATE CONSTRAINT TRIGGER erasure_fault AFTER DELETE ON notification_preferences
             DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION erasure_fault();"
        } else {
            "CREATE TRIGGER erasure_fault BEFORE DELETE ON notification_preferences
             FOR EACH ROW EXECUTE FUNCTION erasure_fault();"
        }
    )))
    .execute(pool)
    .await
    .unwrap();
}

async fn clear_fault(pool: &PgPool) {
    sqlx::raw_sql("DROP TRIGGER erasure_fault ON notification_preferences")
        .execute(pool)
        .await
        .unwrap();
}

async fn fault_firings(pool: &PgPool) -> i64 {
    sqlx::query_scalar("SELECT last_value FROM erasure_fault")
        .fetch_one(pool)
        .await
        .unwrap()
}

#[tokio::test]
async fn a_connection_reset_at_commit_is_retried_and_the_erasure_completes() {
    let _key = test_key_lock()
        .lock()
        .unwrap_or_else(std::sync::PoisonError::into_inner);
    let Some(pool) = fresh_database().await else {
        return;
    };
    let stub = StubAuth::accepting();
    let base = spawn_auth(stub.clone()).await;
    let player = Uuid::now_v7();
    let subject = "usr_01kmp4wyhhfgxsyrjvh8e0tkkf";
    seed(&pool, player, &[subject]).await;
    // The first commit dies after Auth accepted: the incident's window.
    inject_fault(&pool, true, 1).await;

    let (status, body) = delete_account(&app(&pool, Some(base)), &token(&player.to_string())).await;
    assert_eq!(status, StatusCode::OK, "{body}");
    assert_eq!(
        fault_firings(&pool).await,
        2,
        "one failed commit, one retried"
    );
    // Auth was asked once: the retry does not file a second request.
    assert_eq!(stub.subjects(), vec![subject.to_string()]);
    assert_eq!(preference_rows(&pool, player).await, 0);
    assert_eq!(subject_rows(&pool, player).await, 0);
}

#[tokio::test]
async fn a_database_that_keeps_failing_before_auth_erases_nothing_and_keeps_the_sign_in() {
    let _key = test_key_lock()
        .lock()
        .unwrap_or_else(std::sync::PoisonError::into_inner);
    let Some(pool) = fresh_database().await else {
        return;
    };
    let stub = StubAuth::accepting();
    let base = spawn_auth(stub.clone()).await;
    let player = Uuid::now_v7();
    let subject = "usr_01kmp4wyhhfgxsyrjvh8e0tkkf";
    seed(&pool, player, &[subject]).await;
    inject_fault(&pool, false, 1_000).await;

    let (status, body) = delete_account(&app(&pool, Some(base)), &token(&player.to_string())).await;
    assert_eq!(status, StatusCode::SERVICE_UNAVAILABLE, "{body}");
    assert!(message(&body).contains("account_deletion_unavailable"));
    // Bounded: four attempts, then a retryable refusal.
    assert_eq!(fault_firings(&pool).await, 4);
    // No partial state, and Auth was never asked: the person can still sign
    // in and repeat the request.
    assert!(stub.subjects().is_empty());
    assert_eq!(preference_rows(&pool, player).await, 1);
    assert_eq!(subject_rows(&pool, player).await, 1);
}

#[tokio::test]
async fn a_commit_that_keeps_failing_after_auth_leaves_the_rows_whole_for_erase_player() {
    let _key = test_key_lock()
        .lock()
        .unwrap_or_else(std::sync::PoisonError::into_inner);
    let Some(pool) = fresh_database().await else {
        return;
    };
    let stub = StubAuth::accepting();
    let base = spawn_auth(stub.clone()).await;
    let player = Uuid::now_v7();
    let subject = "usr_01kmp4wyhhfgxsyrjvh8e0tkkf";
    seed(&pool, player, &[subject]).await;
    inject_fault(&pool, true, 1_000).await;

    let (status, body) =
        delete_account(&app(&pool, Some(base.clone())), &token(&player.to_string())).await;
    assert_eq!(status, StatusCode::INTERNAL_SERVER_ERROR, "{body}");
    assert!(message(&body).contains("account_deletion_failed"));
    assert_eq!(fault_firings(&pool).await, 4);
    // All or nothing: every row and the subject map survive, so the subject
    // still names the player for the operator's recovery.
    assert_eq!(stub.subjects(), vec![subject.to_string()]);
    assert_eq!(preference_rows(&pool, player).await, 1);
    assert_eq!(subject_rows(&pool, player).await, 1);

    // The database recovers; the operator finishes the erasure by subject.
    clear_fault(&pool).await;
    let (code, report) = erase_player_command(&pool, &base, &["--subject", subject]).await;
    assert_eq!(code, 0, "{report}");
    assert_eq!(report["outcome"], "erased");
    assert_eq!(report["player_found"], true);
    assert_eq!(report["rows_deleted"], 2, "{report}");
    assert_eq!(preference_rows(&pool, player).await, 0);
    assert_eq!(subject_rows(&pool, player).await, 0);
    // Auth was named the same subject again (same idempotency key).
    assert_eq!(stub.subjects(), vec![subject.to_string(); 2]);
}

/// Log lines written while a guard from [`capture_logs`] is held, on this
/// thread (a current-thread test runtime runs spawned tasks here too).
#[derive(Clone, Default)]
struct Logs(Arc<Mutex<Vec<u8>>>);

impl std::io::Write for Logs {
    fn write(&mut self, bytes: &[u8]) -> std::io::Result<usize> {
        self.0.lock().unwrap().extend_from_slice(bytes);
        Ok(bytes.len())
    }

    fn flush(&mut self) -> std::io::Result<()> {
        Ok(())
    }
}

impl Logs {
    fn text(&self) -> String {
        String::from_utf8_lossy(&self.0.lock().unwrap()).into_owned()
    }
}

fn capture_logs(logs: &Logs) -> tracing::subscriber::DefaultGuard {
    let logs = logs.clone();
    tracing::subscriber::set_default(
        tracing_subscriber::fmt()
            .with_ansi(false)
            .with_max_level(tracing::Level::INFO)
            .with_writer(move || logs.clone())
            .finish(),
    )
}

#[tokio::test]
async fn a_client_that_hangs_up_mid_erase_does_not_cancel_the_erasure() {
    let _key = test_key_lock()
        .lock()
        .unwrap_or_else(std::sync::PoisonError::into_inner);
    let Some(pool) = fresh_database().await else {
        return;
    };
    let logs = Logs::default();
    let _logs = capture_logs(&logs);
    // Auth accepts, but slowly (within the 300 ms timeout).
    let stub = StubAuth::accepting().scripted(vec![(202, accepted("privacy-request-1"), 250)]);
    let base = spawn_auth(stub.clone()).await;
    let player = Uuid::now_v7();
    let subject = "usr_01kmp4wyhhfgxsyrjvh8e0tkkf";
    seed(&pool, player, &[subject]).await;

    // The client gives up while Auth is still deciding: the handler future
    // is dropped with the transaction open and Auth's answer unread.
    let app = app(&pool, Some(base));
    let bearer = token(&player.to_string());
    let request = delete_account(&app, &bearer);
    tokio::pin!(request);
    let deadline = tokio::time::Instant::now() + std::time::Duration::from_secs(5);
    while stub.subjects().is_empty() {
        tokio::select! {
            answer = &mut request => panic!("answered before Auth was asked: {answer:?}"),
            () = tokio::time::sleep(std::time::Duration::from_millis(5)) => {}
        }
        assert!(
            tokio::time::Instant::now() < deadline,
            "Auth was never asked"
        );
    }
    drop(request);
    assert_eq!(preference_rows(&pool, player).await, 1, "not committed yet");

    // The erase still runs to its commit and logs it.
    while !logs.text().contains("account data erased") {
        assert!(
            tokio::time::Instant::now() < deadline,
            "the erase did not finish: {}",
            logs.text()
        );
        tokio::time::sleep(std::time::Duration::from_millis(20)).await;
    }
    assert!(logs
        .text()
        .contains("sylphx auth account deletion requested"));
    assert_eq!(stub.subjects(), vec![subject.to_string()]);
    assert_eq!(preference_rows(&pool, player).await, 0);
    assert_eq!(subject_rows(&pool, player).await, 0);
}
