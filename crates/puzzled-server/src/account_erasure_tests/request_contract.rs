//! RPC confirmation, identity checks, and definite Auth outcomes.

use axum::body::Body;
use axum::http::{Method, Request, StatusCode};
use serde_json::json;
use tower::ServiceExt;
use uuid::Uuid;

use super::fixtures::{
    app, delete_account, message, preference_rows, seed, spawn_auth, subject_rows, StubAuth,
    DELETE_PATH, SECRET_KEY,
};
use crate::capabilities::identity_access::adapters::platform_jwt::test_key_lock;
use crate::test_support::{fresh_database, token};

#[tokio::test]
async fn every_subject_naming_the_player_loses_its_sign_in_with_the_rows() {
    let _key = test_key_lock()
        .lock()
        .unwrap_or_else(std::sync::PoisonError::into_inner);
    let Some(pool) = fresh_database().await else {
        return;
    };
    let stub = StubAuth::accepting();
    let base = spawn_auth(stub.clone()).await;

    // The player is mid-migration: Auth still reports the old form as the
    // legacy subject while the new form is the one published.
    let player = Uuid::now_v7();
    seed(
        &pool,
        player,
        &[
            "usr_01kmp4wyhhfgxsyrjvh8e0tkkf",
            &format!("principal-{player}"),
        ],
    )
    .await;

    // Exercise all four anonymous counters and concurrent signup retries in the
    // database-backed erasure lane, then prove only the identity receipt is erased.
    crate::funnel_tests::assert_four_events_and_signup_retry_safety(&pool, &player.to_string())
        .await;

    let (status, body) = delete_account(&app(&pool, Some(base)), &token(&player.to_string())).await;
    assert_eq!(status, StatusCode::OK, "{body}");

    // Both subject forms are named to Auth, under the instance secret key.
    let mut subjects = stub.subjects();
    subjects.sort();
    let mut expected = vec![
        "usr_01kmp4wyhhfgxsyrjvh8e0tkkf".to_string(),
        format!("principal-{player}"),
    ];
    expected.sort();
    assert_eq!(subjects, expected);
    assert_eq!(
        stub.authorizations(),
        vec![format!("Bearer {SECRET_KEY}"); 2]
    );

    // The rows are gone, the subject map included (it is part of the erasure).
    assert_eq!(preference_rows(&pool, player).await, 0);
    assert_eq!(subject_rows(&pool, player).await, 0);
    let receipts: i64 =
        sqlx::query_scalar("SELECT count(*) FROM funnel_signup_receipts WHERE user_id = $1")
            .bind(player)
            .fetch_one(&pool)
            .await
            .unwrap();
    assert_eq!(receipts, 0);
    let events: i64 = sqlx::query_scalar("SELECT count(*) FROM funnel_events")
        .fetch_one(&pool)
        .await
        .unwrap();
    assert_eq!(events, 4);
}

#[tokio::test]
async fn a_player_with_no_subject_row_is_deleted_under_the_old_form() {
    let _key = test_key_lock()
        .lock()
        .unwrap_or_else(std::sync::PoisonError::into_inner);
    let Some(pool) = fresh_database().await else {
        return;
    };
    let stub = StubAuth::accepting();
    let base = spawn_auth(stub.clone()).await;

    // Signed in before the subject map existed: no row, old form only.
    let player = Uuid::now_v7();
    seed(&pool, player, &[]).await;

    let (status, body) = delete_account(&app(&pool, Some(base)), &token(&player.to_string())).await;
    assert_eq!(status, StatusCode::OK, "{body}");
    assert_eq!(stub.subjects(), vec![format!("principal-{player}")]);
    assert_eq!(preference_rows(&pool, player).await, 0);
}

#[tokio::test]
async fn an_account_auth_does_not_hold_is_still_erased() {
    let _key = test_key_lock()
        .lock()
        .unwrap_or_else(std::sync::PoisonError::into_inner);
    let Some(pool) = fresh_database().await else {
        return;
    };
    // Auth holds no such account (already deleted, or never created).
    // Auth's own answer (identity-api `map_error` of NotFound("user not
    // found")); a bare 404 is ambiguous, not absence.
    let stub = StubAuth::answering(
        404,
        json!({"code": "not_found", "error": "user not found", "authority": "identity"}),
    );
    let base = spawn_auth(stub.clone()).await;

    let player = Uuid::now_v7();
    seed(&pool, player, &[]).await;

    let (status, body) = delete_account(&app(&pool, Some(base)), &token(&player.to_string())).await;
    assert_eq!(status, StatusCode::OK, "{body}");
    assert_eq!(stub.subjects(), vec![format!("principal-{player}")]);
    assert_eq!(preference_rows(&pool, player).await, 0);
}

#[tokio::test]
async fn a_refused_auth_deletion_leaves_every_row_in_place() {
    let _key = test_key_lock()
        .lock()
        .unwrap_or_else(std::sync::PoisonError::into_inner);
    let Some(pool) = fresh_database().await else {
        return;
    };
    // A definite refusal (a 4xx Auth decided on): the sign-in is intact.
    let stub = StubAuth::answering(403, json!({"error": "privacy_request_forbidden"}));
    let base = spawn_auth(stub.clone()).await;

    let player = Uuid::now_v7();
    let subject = "usr_01kmp4wyhhfgxsyrjvh8e0tkkf";
    seed(&pool, player, &[subject]).await;

    let (status, body) = delete_account(&app(&pool, Some(base)), &token(&player.to_string())).await;
    assert_eq!(status, StatusCode::SERVICE_UNAVAILABLE, "{body}");
    assert!(message(&body).contains("identity_account_deletion_failed"));
    // Nothing was erased: the account stays whole and the retry repeats the
    // same Auth request (its idempotency key is fixed per subject).
    assert_eq!(preference_rows(&pool, player).await, 1);
    assert_eq!(subject_rows(&pool, player).await, 1);
    assert_eq!(stub.subjects(), vec![subject.to_string()]);
}

#[tokio::test]
async fn an_unbound_auth_credential_refuses_the_erasure() {
    let _key = test_key_lock()
        .lock()
        .unwrap_or_else(std::sync::PoisonError::into_inner);
    let Some(pool) = fresh_database().await else {
        return;
    };

    let player = Uuid::now_v7();
    seed(&pool, player, &["usr_01kmp4wyhhfgxsyrjvh8e0tkkf"]).await;

    // Enable Auth not configured: the product's rows and the sign-in cannot
    // both be erased, so the deletion refuses rather than half-erasing.
    let (status, body) = delete_account(&app(&pool, None), &token(&player.to_string())).await;
    assert_eq!(status, StatusCode::SERVICE_UNAVAILABLE, "{body}");
    assert!(message(&body).contains("identity_credential_unconfigured"));
    assert_eq!(preference_rows(&pool, player).await, 1);
    assert_eq!(subject_rows(&pool, player).await, 1);
}

#[tokio::test]
async fn the_confirmation_and_the_identity_are_checked_before_auth_is_called() {
    let _key = test_key_lock()
        .lock()
        .unwrap_or_else(std::sync::PoisonError::into_inner);
    let Some(pool) = fresh_database().await else {
        return;
    };
    let stub = StubAuth::accepting();
    let base = spawn_auth(stub.clone()).await;
    let shouter = app(&pool, Some(base));

    let player = Uuid::now_v7();
    seed(&pool, player, &[]).await;

    // Typing something other than DELETE erases nothing.
    let response = shouter
        .clone()
        .oneshot(
            Request::builder()
                .method(Method::POST)
                .uri(DELETE_PATH)
                .header("content-type", "application/json")
                .header(
                    "authorization",
                    format!("Bearer {}", token(&player.to_string())),
                )
                .body(Body::from(json!({"confirm": "delete"}).to_string()))
                .unwrap(),
        )
        .await
        .unwrap();
    assert_eq!(response.status(), StatusCode::BAD_REQUEST);
    // A request with no identity is refused too.
    let (status, _) = delete_account(&shouter, "").await;
    assert_eq!(status, StatusCode::UNAUTHORIZED);

    assert!(stub.seen.lock().unwrap().is_empty());
    assert_eq!(preference_rows(&pool, player).await, 1);
}

/// The player id of a bearer is what Auth is told about, and the api refuses
/// rather than guessing when it is not a player.
#[tokio::test]
async fn an_identity_that_is_not_a_player_id_erases_nothing() {
    let _key = test_key_lock()
        .lock()
        .unwrap_or_else(std::sync::PoisonError::into_inner);
    let Some(pool) = fresh_database().await else {
        return;
    };
    let stub = StubAuth::accepting();
    let base = spawn_auth(stub.clone()).await;

    let (status, body) =
        delete_account(&app(&pool, Some(base)), &token("guest_not-a-player")).await;
    assert_eq!(status, StatusCode::INTERNAL_SERVER_ERROR, "{body}");
    assert!(message(&body).contains("account_deletion_failed"));
    assert!(stub.seen.lock().unwrap().is_empty());
}
