//! Operator erasure dry runs, repeat requests, and Auth refusal reporting.

use axum::http::StatusCode;
use serde_json::json;
use uuid::Uuid;

use super::fixtures::{
    app, delete_account, erase_player_command, preference_rows, seed, spawn_auth, subject_rows,
    StubAuth,
};
use crate::capabilities::identity_access::adapters::platform_jwt::test_key_lock;
use crate::test_support::{fresh_database, token};

#[tokio::test]
async fn a_second_erasure_is_a_no_op() {
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

    let (status, body) =
        delete_account(&app(&pool, Some(base.clone())), &token(&player.to_string())).await;
    assert_eq!(status, StatusCode::OK, "{body}");
    assert_eq!(body["rowsDeleted"], "2", "{body}");

    // Rows-only erasure again: nothing left.
    let again = crate::capabilities::preferences::adapters::account_deletion::delete_account_data(
        &pool,
        &player.to_string(),
    )
    .await;
    assert_eq!(again, Ok(0));
    // The operator command again: the subject no longer names a player, so
    // only Auth is asked (it answers the same request), and nothing is deleted.
    let (code, report) = erase_player_command(&pool, &base, &["--subject", subject]).await;
    assert_eq!(code, 0, "{report}");
    assert_eq!(report["player_found"], false);
    assert_eq!(report["rows_deleted"], 0);
    assert_eq!(report["outcome"], "sign_in_only");
}

#[tokio::test]
async fn erase_player_dry_run_counts_and_changes_nothing() {
    let _key = test_key_lock()
        .lock()
        .unwrap_or_else(std::sync::PoisonError::into_inner);
    let Some(pool) = fresh_database().await else {
        return;
    };
    let stub = StubAuth::accepting();
    let base = spawn_auth(stub.clone()).await;
    let player = Uuid::now_v7();
    seed(&pool, player, &[]).await;

    // An old-form subject with no map row still names its player.
    let subject = format!("principal-{player}");
    let (code, report) =
        erase_player_command(&pool, &base, &["--dry-run", "--subject", &subject]).await;
    assert_eq!(code, 0, "{report}");
    assert_eq!(report["outcome"], "dry_run");
    assert_eq!(report["rows_found"], 1);
    assert!(stub.subjects().is_empty());
    assert_eq!(preference_rows(&pool, player).await, 1);

    let (code, report) = erase_player_command(&pool, &base, &["--subject", &subject]).await;
    assert_eq!(code, 0, "{report}");
    assert_eq!(report["rows_deleted"], 1);
    assert_eq!(stub.subjects(), vec![subject.clone()]);
    assert_eq!(preference_rows(&pool, player).await, 0);
}

#[tokio::test]
async fn erase_player_refuses_while_auth_refuses_and_erases_nothing() {
    let _key = test_key_lock()
        .lock()
        .unwrap_or_else(std::sync::PoisonError::into_inner);
    let Some(pool) = fresh_database().await else {
        return;
    };
    let stub = StubAuth::answering(403, json!({"error": "privacy_request_forbidden"}));
    let base = spawn_auth(stub.clone()).await;
    let player = Uuid::now_v7();
    let subject = "usr_01kmp4wyhhfgxsyrjvh8e0tkkf";
    seed(&pool, player, &[subject]).await;

    let (code, report) = erase_player_command(&pool, &base, &["--subject", subject]).await;
    assert_eq!(code, 6, "{report}");
    assert_eq!(report["outcome"], "auth_refused");
    assert_eq!(preference_rows(&pool, player).await, 1);
    assert_eq!(subject_rows(&pool, player).await, 1);
}

#[tokio::test]
async fn erase_player_reports_an_unconfirmed_sign_in_and_erases_no_row() {
    let _key = test_key_lock()
        .lock()
        .unwrap_or_else(std::sync::PoisonError::into_inner);
    let Some(pool) = fresh_database().await else {
        return;
    };
    let stub = StubAuth::answering(502, json!({"error": "bad_gateway"}));
    let base = spawn_auth(stub.clone()).await;
    let player = Uuid::now_v7();
    let subject = "usr_01kmp4wyhhfgxsyrjvh8e0tkkf";
    seed(&pool, player, &[subject]).await;

    let (code, report) = erase_player_command(&pool, &base, &["--subject", subject]).await;
    assert_eq!(code, 6, "{report}");
    assert_eq!(report["outcome"], "sign_in_unconfirmed");
    assert_eq!(preference_rows(&pool, player).await, 1);
    assert_eq!(subject_rows(&pool, player).await, 1);
}
