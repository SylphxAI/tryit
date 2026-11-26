//! Crossword and Word Groups daily play.

use super::support::{player_submit, served_today};
use crate::test_support::{body_json, build_connect_request};
use crate::{router, AppState};
use axum::body::Body;
use axum::http::StatusCode;
use tower::ServiceExt;

fn word_groups_win_submission(sol: &serde_json::Value) -> String {
    let cats = sol.get("categories").expect("categories");
    let found: Vec<serde_json::Value> = cats
        .as_array()
        .expect("arr")
        .iter()
        .map(|c| c.get("words").cloned().unwrap_or(serde_json::Value::Null))
        .collect();
    let submission = serde_json::json!({ "foundCategories": found, "mistakes": 0 });
    serde_json::json!({
        "gameSlug": "word-groups",
        "status": "won",
        "attempts": 4,
        "timeSpentMs": "8000",
        "submissionJson": submission.to_string(),
    })
    .to_string()
}

pub(super) async fn connect_crossword_free_floor_can_finish_win() {
    // Product free floor: crossword must be finishable without content store.
    let app = router(AppState::new(None));
    let (_pd, sol) = served_today("crossword").await;
    let solution_grid = sol.get("grid").expect("solution grid");
    // Client finalGrid: string letters (serde Option<String> accepts plain strings).
    let submission = serde_json::json!({ "finalGrid": solution_grid });
    let body = serde_json::json!({
        "gameSlug": "crossword",
        "status": "won",
        "attempts": 1,
        "timeSpentMs": "5000",
        "submissionJson": submission.to_string(),
    })
    .to_string();
    let response = match app.oneshot(player_submit(body)).await {
        Ok(r) => r,
        Err(error) => panic!("submit: {error}"),
    };
    assert_eq!(response.status(), StatusCode::OK);
    let json = body_json(response).await;
    assert_eq!(
        json["valid"], true,
        "crossword free win must validate: {json}"
    );
    assert_eq!(json["status"], "won");
    assert!(json["score"].as_i64().unwrap_or(0) > 0);
}

pub(super) async fn connect_get_daily_word_groups_serves_non_stub_puzzle_data() {
    let app = router(AppState::new(None));
    let response = match app
        .oneshot(build_connect_request(
            "/puzzled.v1.PuzzleService/GetDaily",
            Body::from(r#"{"gameSlug":"word-groups"}"#),
        ))
        .await
    {
        Ok(response) => response,
        Err(error) => panic!("connect GetDaily word-groups: {error}"),
    };
    assert_eq!(response.status(), StatusCode::OK);
    let json = body_json(response).await;
    assert_eq!(json["gameSlug"], "word-groups");
    assert_eq!(json["mode"], "daily");
    assert_eq!(json["canPlay"], true);
    assert!(
        json.get("stub").map_or(true, |v| v == false || v.is_null()),
        "word-groups GetDaily must not stub: {:?}",
        json.get("stub")
    );
    let data = json["puzzleDataJson"].as_str().expect("puzzleDataJson");
    assert!(!data.is_empty() && data != "null", "must serve puzzle data");
    let payload: serde_json::Value = serde_json::from_str(data).expect("json");
    let words = payload["words"].as_array().expect("words");
    assert_eq!(words.len(), 16);
    assert!(payload.get("categories").is_none());
    assert!(
        json.get("solutionJson").is_none(),
        "solutions must never leave the server"
    );
}

pub(super) async fn connect_word_groups_free_floor_can_finish_win() {
    let app = router(AppState::new(None));
    let (_pd, sol) = served_today("word-groups").await;
    let body = word_groups_win_submission(&sol);
    let response = match app.oneshot(player_submit(body)).await {
        Ok(r) => r,
        Err(error) => panic!("submit: {error}"),
    };
    assert_eq!(response.status(), StatusCode::OK);
    let json = body_json(response).await;
    assert_eq!(
        json["valid"], true,
        "word-groups free win must validate: {json}"
    );
    assert_eq!(json["status"], "won");
    assert!(json["score"].as_i64().unwrap_or(0) > 0);
}

pub(super) async fn connect_word_groups_free_floor_can_finish_loss() {
    let app = router(AppState::new(None));
    let (_pd, sol) = served_today("word-groups").await;
    let first = sol["categories"][0]["words"].clone();
    let submission = serde_json::json!({
        "foundCategories": [first],
        "mistakes": 4
    });
    let body = serde_json::json!({
        "gameSlug": "word-groups",
        "status": "lost",
        "attempts": 5,
        "timeSpentMs": "9000",
        "submissionJson": submission.to_string(),
    })
    .to_string();
    let response = match app.oneshot(player_submit(body)).await {
        Ok(r) => r,
        Err(error) => panic!("submit: {error}"),
    };
    assert_eq!(response.status(), StatusCode::OK);
    let json = body_json(response).await;
    assert_eq!(
        json["valid"], true,
        "word-groups free loss must validate: {json}"
    );
    assert_eq!(json["status"], "lost");
    assert_eq!(json["score"].as_i64().unwrap_or(-1), 0);
}

pub(super) async fn connect_word_groups_rejects_false_win() {
    let app = router(AppState::new(None));
    let submission = serde_json::json!({
        "foundCategories": [["APPLE", "BANANA", "CHERRY", "DATE"]],
        "mistakes": 0
    });
    let body = serde_json::json!({
        "gameSlug": "word-groups",
        "status": "won",
        "attempts": 1,
        "timeSpentMs": "1000",
        "submissionJson": submission.to_string(),
    })
    .to_string();
    let response = match app.oneshot(player_submit(body)).await {
        Ok(r) => r,
        Err(error) => panic!("submit: {error}"),
    };
    assert_eq!(response.status(), StatusCode::OK);
    let json = body_json(response).await;
    assert!(
        json.get("valid")
            .map_or(true, |v| v == false || v.is_null()),
        "false win must be invalid: {json}"
    );
}

pub(super) fn word_groups_one_finish_guard_keys_guest_module_day() {
    use puzzled_core::puzzle_play::game_slugs::ModuleClass;
    use puzzled_core::puzzle_play::ritual_completion::{
        ritual_already_finished, submit_must_guard_already_played, RitualCompletionRow,
    };

    assert!(
        submit_must_guard_already_played(true, None, true),
        "store + content day known => guard even without puzzle_id"
    );
    let prior = [RitualCompletionRow {
        user_id: "guest_a1b2c3d4-e5f6-7890-abcd-ef1234567890".into(),
        day_key: "2026-08-25".into(),
        module_class: ModuleClass::PuzzleRitual,
        is_ritual: true,
    }];
    assert!(ritual_already_finished(
        &prior,
        "guest_a1b2c3d4-e5f6-7890-abcd-ef1234567890",
        "2026-08-25",
        "word-groups",
    ));
}
