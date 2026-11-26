//! Auth responses that do not conclusively say whether the sign-in is intact.

use axum::http::StatusCode;
use serde_json::{json, Value};
use uuid::Uuid;

use super::fixtures::{
    accepted, app, delete_account, erase_player_command, message, preference_rows, seed,
    spawn_auth, subject_rows, StubAuth,
};
use crate::capabilities::identity_access::adapters::platform_jwt::test_key_lock;
use crate::test_support::{fresh_database, token};

#[tokio::test]
async fn an_auth_timeout_is_retried_with_the_same_request_and_the_erasure_completes() {
    let _key = test_key_lock()
        .lock()
        .unwrap_or_else(std::sync::PoisonError::into_inner);
    let Some(pool) = fresh_database().await else {
        return;
    };
    // Auth records the request, then answers too late (past the 300 ms
    // timeout): it may have accepted it. The second answer is in time.
    let stub = StubAuth::accepting().scripted(vec![(202, accepted("privacy-request-1"), 2_000)]);
    let base = spawn_auth(stub.clone()).await;
    let player = Uuid::now_v7();
    let subject = "usr_01kmp4wyhhfgxsyrjvh8e0tkkf";
    seed(&pool, player, &[subject]).await;

    let (status, body) = delete_account(&app(&pool, Some(base)), &token(&player.to_string())).await;
    assert_eq!(status, StatusCode::OK, "{body}");
    // Asked twice, with one fixed idempotency key: one request at Auth.
    assert_eq!(stub.subjects(), vec![subject.to_string(); 2]);
    let keys: Vec<Value> = stub
        .seen
        .lock()
        .unwrap()
        .iter()
        .map(|r| r["body"]["idempotency_key"].clone())
        .collect();
    assert_eq!(keys[0], keys[1]);
    assert_eq!(preference_rows(&pool, player).await, 0);
    assert_eq!(subject_rows(&pool, player).await, 0);
}

#[tokio::test]
async fn auth_that_keeps_answering_503_leaves_the_rows_whole_and_says_run_erase_player() {
    let _key = test_key_lock()
        .lock()
        .unwrap_or_else(std::sync::PoisonError::into_inner);
    let Some(pool) = fresh_database().await else {
        return;
    };
    // Auth records every request and answers 503: it may have suspended the
    // person anyway, so this is not a clean, retryable refusal.
    let stub = StubAuth::answering(503, json!({"error": "identity_unavailable"}));
    let base = spawn_auth(stub.clone()).await;
    let player = Uuid::now_v7();
    let subject = "usr_01kmp4wyhhfgxsyrjvh8e0tkkf";
    seed(&pool, player, &[subject]).await;

    let (status, body) = delete_account(&app(&pool, Some(base)), &token(&player.to_string())).await;
    assert_eq!(status, StatusCode::INTERNAL_SERVER_ERROR, "{body}");
    assert!(message(&body).contains("account_deletion_failed"));
    // Bounded: four attempts, the same subject each time.
    assert_eq!(stub.subjects(), vec![subject.to_string(); 4]);
    assert_eq!(preference_rows(&pool, player).await, 1);
    assert_eq!(subject_rows(&pool, player).await, 1);

    // Auth recovers; the operator finishes it by subject.
    let healthy = StubAuth::accepting();
    let base = spawn_auth(healthy.clone()).await;
    let (code, report) = erase_player_command(&pool, &base, &["--subject", subject]).await;
    assert_eq!(code, 0, "{report}");
    assert_eq!(report["outcome"], "erased");
    assert_eq!(preference_rows(&pool, player).await, 0);
    assert_eq!(subject_rows(&pool, player).await, 0);
}

#[tokio::test]
async fn a_refusal_after_another_subject_was_accepted_is_not_a_clean_refusal() {
    let _key = test_key_lock()
        .lock()
        .unwrap_or_else(std::sync::PoisonError::into_inner);
    let Some(pool) = fresh_database().await else {
        return;
    };
    // Two subjects: Auth accepts the first, then refuses the second.
    let stub = StubAuth::answering(403, json!({"error": "privacy_request_forbidden"}))
        .scripted(vec![(202, accepted("privacy-request-1"), 0)]);
    let base = spawn_auth(stub.clone()).await;
    let player = Uuid::now_v7();
    let legacy = format!("principal-{player}");
    seed(&pool, player, &["usr_01kmp4wyhhfgxsyrjvh8e0tkkf", &legacy]).await;

    let (status, body) = delete_account(&app(&pool, Some(base)), &token(&player.to_string())).await;
    assert_eq!(status, StatusCode::INTERNAL_SERVER_ERROR, "{body}");
    assert!(message(&body).contains("account_deletion_failed"));
    assert_eq!(stub.subjects().len(), 2);
    assert_eq!(preference_rows(&pool, player).await, 1);
    assert_eq!(subject_rows(&pool, player).await, 2);
}

#[tokio::test]
async fn a_404_that_is_not_auths_own_keeps_the_rows_and_says_run_erase_player() {
    let _key = test_key_lock()
        .lock()
        .unwrap_or_else(std::sync::PoisonError::into_inner);
    let Some(pool) = fresh_database().await else {
        return;
    };
    // A misrouted gateway answers 404 at a proxy: nothing says the
    // sign-in is gone, so the rows must not go either.
    let stub = StubAuth::answering(404, json!({"error": "not_found"}));
    let base = spawn_auth(stub.clone()).await;
    let player = Uuid::now_v7();
    let subject = "usr_01kmp4wyhhfgxsyrjvh8e0tkkf";
    seed(&pool, player, &[subject]).await;

    let (status, body) = delete_account(&app(&pool, Some(base)), &token(&player.to_string())).await;
    assert_eq!(status, StatusCode::INTERNAL_SERVER_ERROR, "{body}");
    assert!(message(&body).contains("account_deletion_failed"));
    assert_eq!(stub.subjects(), vec![subject.to_string(); 4]);
    assert_eq!(preference_rows(&pool, player).await, 1);
    assert_eq!(subject_rows(&pool, player).await, 1);
}
