//! Word Guess and Crowns daily play.

use super::support::{player_submit, served_today};
use crate::test_support::{body_json, build_connect_request};
use crate::{router, AppState};
use axum::body::Body;
use axum::http::StatusCode;
use tower::ServiceExt;

pub(super) async fn connect_get_daily_word_guess_guest_path() {
    let app = router(AppState::new(None));
    let response = match app
        .oneshot(build_connect_request(
            "/puzzled.v1.PuzzleService/GetDaily",
            Body::from(r#"{"gameSlug":"word-guess"}"#),
        ))
        .await
    {
        Ok(response) => response,
        Err(error) => panic!("connect GetDaily word-guess: {error}"),
    };
    assert_eq!(response.status(), StatusCode::OK);
    let json = body_json(response).await;
    assert_eq!(json["gameSlug"], "word-guess");
    assert_eq!(json["mode"], "daily");
    assert_eq!(json["canPlay"], true);
    assert!(
        json.get("stub").map_or(true, |v| v == false || v.is_null()),
        "word-guess GetDaily must not stub: {:?}",
        json.get("stub")
    );
    let data = json["puzzleDataJson"].as_str().expect("puzzleDataJson");
    assert!(!data.is_empty() && data != "null", "must serve puzzle data");
    let payload: serde_json::Value = serde_json::from_str(data).expect("json");
    assert_eq!(payload["wordLength"], 5);
    assert_eq!(payload["maxAttempts"], 6);
    assert!(payload.get("word").is_none());
    assert!(
        json.get("solutionJson").is_none(),
        "solutions must never leave the server"
    );
}

pub(super) async fn connect_get_daily_crowns_guest_path() {
    let app = router(AppState::new(None));
    let response = match app
        .oneshot(build_connect_request(
            "/puzzled.v1.PuzzleService/GetDaily",
            Body::from(r#"{"gameSlug":"crowns"}"#),
        ))
        .await
    {
        Ok(response) => response,
        Err(error) => panic!("connect GetDaily crowns: {error}"),
    };
    assert_eq!(response.status(), StatusCode::OK);
    let json = body_json(response).await;
    assert_eq!(json["gameSlug"], "crowns");
    assert_eq!(json["mode"], "daily");
    assert_eq!(json["canPlay"], true);
    assert!(
        json.get("stub").map_or(true, |v| v == false || v.is_null()),
        "crowns GetDaily must not stub: {:?}",
        json.get("stub")
    );
    let data = json["puzzleDataJson"].as_str().expect("puzzleDataJson");
    let payload: serde_json::Value = serde_json::from_str(data).expect("json");
    assert_eq!(payload["size"], 6);
    let regions = payload["regions"].as_array().expect("regions");
    assert_eq!(regions.len(), 6);
    assert!(payload.get("queens").is_none());
    assert!(
        json.get("solutionJson").is_none(),
        "solutions must never leave the server"
    );
}

pub(super) async fn connect_word_guess_free_floor_can_finish_win() {
    let app = router(AppState::new(None));
    let (_pd, sol) = served_today("word-guess").await;
    let word = sol["word"].as_str().expect("word");
    let submission = serde_json::json!({ "guesses": [word] });
    let body = serde_json::json!({
        "gameSlug": "word-guess",
        "status": "won",
        "attempts": 1,
        "timeSpentMs": "4000",
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
        "word-guess free win must validate: {json}"
    );
    assert_eq!(json["status"], "won");
    assert!(json["score"].as_i64().unwrap_or(0) > 0);
}

pub(super) async fn connect_crowns_free_floor_can_finish_win() {
    let app = router(AppState::new(None));
    let (pd, sol) = served_today("crowns").await;
    let size = pd["size"].as_u64().unwrap_or(0) as usize;
    let mut grid = vec![vec![false; size]; size];
    if let Some(queens) = sol["queens"].as_array() {
        for pair in queens {
            let cells = pair.as_array();
            let row = cells
                .and_then(|c| c.first())
                .and_then(serde_json::Value::as_u64)
                .unwrap_or(0) as usize;
            let col = cells
                .and_then(|c| c.get(1))
                .and_then(serde_json::Value::as_u64)
                .unwrap_or(0) as usize;
            if row < size && col < size {
                grid[row][col] = true;
            }
        }
    }
    let submission = serde_json::json!({ "finalGrid": grid });
    let body = serde_json::json!({
        "gameSlug": "crowns",
        "status": "won",
        "attempts": 1,
        "timeSpentMs": "8000",
        "submissionJson": submission.to_string(),
    })
    .to_string();
    let response = match app.oneshot(player_submit(body)).await {
        Ok(r) => r,
        Err(error) => panic!("submit: {error}"),
    };
    assert_eq!(response.status(), StatusCode::OK);
    let json = body_json(response).await;
    assert_eq!(json["valid"], true, "crowns free win must validate: {json}");
    assert_eq!(json["status"], "won");
    assert!(json["score"].as_i64().unwrap_or(0) > 0);
}

pub(super) async fn connect_crowns_free_floor_can_finish_loss() {
    let app = router(AppState::new(None));
    let empty = vec![vec![false; 6]; 6];
    let submission = serde_json::json!({ "finalGrid": empty });
    let body = serde_json::json!({
        "gameSlug": "crowns",
        "status": "lost",
        "attempts": 1,
        "timeSpentMs": "2000",
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
        "crowns free loss must validate: {json}"
    );
    assert_eq!(json["status"], "lost");
    assert_eq!(json["score"].as_i64().unwrap_or(-1), 0);
}
