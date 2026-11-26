//! Daily puzzle reads and submission contracts on the Connect router.

use crate::test_support::{
    body_json, build_connect_request, build_connect_request_with_auth, connect_error_message,
    mint_test_token,
};
use crate::{router, AppState};
use axum::body::Body;
use axum::http::{Method, Request, StatusCode};
use tower::ServiceExt;

fn today_free_slug() -> String {
    let today = puzzled_core::puzzle_play::daily_time::product_day_key(chrono::Utc::now());
    puzzled_core::puzzle_play::game_slugs::todays_free_game(today).to_string()
}

fn densifies_without_store(slug: &str) -> bool {
    matches!(
        slug,
        "sudoku" | "crossword" | "word-groups" | "word-guess" | "crowns" | "queens"
    )
}

#[tokio::test]
async fn connect_get_daily_serves_every_game_without_a_paid_tier() {
    // Puzzled sells no paid tier: every game, not only today's featured
    // one, is served to a plain account with no billing read at all.
    for slug in puzzled_core::puzzle_play::game_slugs::FREE_GAME_ROTATION {
        let app = router(AppState::new(None));
        let token = mint_test_token("user_free_01");
        let body = format!(r#"{{"gameSlug":"{slug}"}}"#);
        let response = match app
            .oneshot(build_connect_request_with_auth(
                "/puzzled.v1.PuzzleService/GetDaily",
                Body::from(body),
                &token,
            ))
            .await
        {
            Ok(response) => response,
            Err(error) => panic!("connect GetDaily {slug}: {error}"),
        };
        assert_eq!(response.status(), StatusCode::OK, "{slug} must be served");
        let json = body_json(response).await;
        assert_eq!(json["canPlay"], true, "{slug} must be playable");
    }
}

#[tokio::test]
async fn connect_get_daily_serves_archive_without_a_paid_tier() {
    let app = router(AppState::new(None));
    let token = mint_test_token("user_free_02");
    let response = match app
        .oneshot(build_connect_request_with_auth(
            "/puzzled.v1.PuzzleService/GetDaily",
            Body::from(r#"{"gameSlug":"word-guess","puzzleDate":"2026-01-01"}"#),
            &token,
        ))
        .await
    {
        Ok(response) => response,
        Err(error) => panic!("connect GetDaily archive: {error}"),
    };
    assert_eq!(response.status(), StatusCode::OK);
    let json = body_json(response).await;
    assert_eq!(json["canPlay"], true);
}

#[tokio::test]
async fn connect_get_daily_refuses_a_future_day() {
    let app = router(AppState::new(None));
    let token = mint_test_token("user_free_03");
    let response = match app
        .oneshot(build_connect_request_with_auth(
            "/puzzled.v1.PuzzleService/GetDaily",
            Body::from(r#"{"gameSlug":"word-guess","puzzleDate":"2999-01-01"}"#),
            &token,
        ))
        .await
    {
        Ok(response) => response,
        Err(error) => panic!("connect GetDaily future: {error}"),
    };
    assert_eq!(response.status(), StatusCode::BAD_REQUEST);
    let json = body_json(response).await;
    assert!(connect_error_message(&json).contains("future_puzzle_date"));
}

#[tokio::test]
async fn connect_get_puzzle_densifies_sudoku_grid() {
    let app = router(AppState::new(None));
    let response = match app
        .oneshot(build_connect_request(
            "/puzzled.v1.PuzzleService/GetPuzzle",
            Body::from(r#"{"gameSlug":"sudoku","seed":"42","difficulty":"easy"}"#),
        ))
        .await
    {
        Ok(response) => response,
        Err(error) => panic!("connect GetPuzzle: {error}"),
    };
    assert_eq!(response.status(), StatusCode::OK);
    let json = body_json(response).await;
    assert_eq!(json["gameSlug"], "sudoku");
    assert_eq!(json["slice"], "S2-puzzle-connect");
    let puzzle_data = json["puzzleDataJson"]
        .as_str()
        .expect("puzzleDataJson densified");
    let payload: serde_json::Value = serde_json::from_str(puzzle_data).expect("puzzle json");
    assert!(
        payload.get("grid").is_some(),
        "expected densified grid JSON: {payload}"
    );
    assert!(
        json.get("solutionJson").is_none(),
        "solutions must never leave the server"
    );
}

#[tokio::test]
async fn connect_get_daily_requires_game_slug() {
    let app = router(AppState::new(None));
    let response = match app
        .oneshot(build_connect_request(
            "/puzzled.v1.PuzzleService/GetDaily",
            Body::from("{}"),
        ))
        .await
    {
        Ok(response) => response,
        Err(error) => panic!("connect GetDaily: {error}"),
    };
    assert_eq!(response.status(), StatusCode::BAD_REQUEST);
}

#[tokio::test]
async fn connect_get_daily_densifies_envelope() {
    // Day-agnostic: use today's free-rotation game (guests may play it).
    let free_slug = today_free_slug();
    let app = router(AppState::new(None));
    let body = format!(r#"{{"gameSlug":"{free_slug}","difficulty":"medium"}}"#);
    let response = match app
        .oneshot(build_connect_request(
            "/puzzled.v1.PuzzleService/GetDaily",
            Body::from(body),
        ))
        .await
    {
        Ok(response) => response,
        Err(error) => panic!("connect GetDaily: {error}"),
    };
    assert_eq!(response.status(), StatusCode::OK);
    let json = body_json(response).await;
    assert_eq!(json["gameSlug"], free_slug);
    assert_eq!(json["slice"], "S2-daily-connect");
    assert_eq!(json["mode"], "daily");
    assert_eq!(json["canPlay"], true);
    assert!(json["puzzleNumber"].as_u64().unwrap_or(0) > 0);
    assert!(!json["puzzleDate"].as_str().unwrap_or("").is_empty());
    // Without a DB, every free-rotation slug densifies via on-server generators.
    if densifies_without_store(&free_slug) {
        assert!(
            json.get("stub").map_or(true, |v| v == false || v.is_null()),
            "unexpected stub for densified free game {free_slug}: {:?}",
            json.get("stub")
        );
        assert!(
            json.get("puzzleDataJson")
                .and_then(|v| v.as_str())
                .map(|s| !s.is_empty() && s != "null")
                .unwrap_or(false),
            "densified free game must serve puzzle data"
        );
    }
}

#[tokio::test]
async fn connect_submit_guess_requires_identity() {
    let app = router(AppState::new(None));
    let response = match app
        .oneshot(build_connect_request(
            "/puzzled.v1.PuzzleService/SubmitGuess",
            Body::from(
                r#"{"gameSlug":"sudoku","difficulty":"easy","status":"won","attempts":1,"timeSpentMs":"1000","submissionJson":"{}"}"#,
            ),
        ))
        .await
    {
        Ok(response) => response,
        Err(error) => panic!("connect SubmitGuess: {error}"),
    };
    assert_eq!(response.status(), StatusCode::UNAUTHORIZED);
}

#[tokio::test]
async fn connect_submit_guess_refuses_unsigned_guest_id() {
    // Guest free-ritual path: X-Puzzled-Guest-Id → past identity gate.
    // Empty submission is still invalid (server-authoritative validation).
    let app = router(AppState::new(None));
    let free_slug = today_free_slug();
    let body = format!(
        r#"{{"gameSlug":"{free_slug}","difficulty":"easy","status":"won","attempts":1,"timeSpentMs":"1000","submissionJson":"{{}}"}}"#
    );
    let request = match Request::builder()
        .method(Method::POST)
        .uri("/puzzled.v1.PuzzleService/SubmitGuess")
        .header(axum::http::header::CONTENT_TYPE, "application/json")
        .header("x-puzzled-guest-id", "a1b2c3d4-e5f6-7890-abcd-ef1234567890")
        .body(Body::from(body))
    {
        Ok(r) => r,
        Err(error) => panic!("build guest submit: {error}"),
    };
    let response = match app.oneshot(request).await {
        Ok(response) => response,
        Err(error) => panic!("connect SubmitGuess guest: {error}"),
    };
    assert_eq!(response.status(), StatusCode::UNAUTHORIZED);
}

#[tokio::test]
async fn connect_submit_guess_validates_against_served_puzzle() {
    let app = router(AppState::new(None));
    let token = mint_test_token("user_test_01");
    let free_slug = today_free_slug();
    // An empty submission for a served puzzle must be invalid.
    let body = format!(
        r#"{{"gameSlug":"{free_slug}","difficulty":"easy","status":"won","attempts":1,"timeSpentMs":"1000","submissionJson":"{{}}"}}"#
    );
    let response = match app
        .oneshot(build_connect_request_with_auth(
            "/puzzled.v1.PuzzleService/SubmitGuess",
            Body::from(body),
            &token,
        ))
        .await
    {
        Ok(response) => response,
        Err(error) => panic!("connect SubmitGuess: {error}"),
    };
    if densifies_without_store(&free_slug) {
        assert_eq!(response.status(), StatusCode::OK);
        let json = body_json(response).await;
        assert!(
            json.get("valid")
                .map_or(true, |v| v == false || v.is_null()),
            "expected invalid verdict, got: {:?}",
            json.get("valid")
        );
        assert_eq!(json["slice"], "S2-puzzle-solution-connect");
    } else {
        // No content store / generator in tests -> unserved.
        assert_eq!(response.status(), StatusCode::NOT_FOUND);
    }
}

#[tokio::test]
async fn connect_submit_guess_rejects_unserved_puzzle() {
    // Without a content DB:
    // - free-rotation slugs densify via deterministic generation
    // - non-rotation modules must fail closed (404 unserved) — no accept-any.
    let app = router(AppState::new(None));
    let token = mint_test_token("user_test_02");
    let free_slug = today_free_slug();
    let body = format!(
        r#"{{"gameSlug":"{free_slug}","status":"won","attempts":3,"timeSpentMs":"1200","submissionJson":"{{\"guesses\":[\"HELLO\"]}}"}}"#
    );
    let response = match app
        .oneshot(build_connect_request_with_auth(
            "/puzzled.v1.PuzzleService/SubmitGuess",
            Body::from(body),
            &token,
        ))
        .await
    {
        Ok(response) => response,
        Err(error) => panic!("connect SubmitGuess non-sudoku: {error}"),
    };
    if densifies_without_store(&free_slug) {
        assert_eq!(response.status(), StatusCode::OK);
        let json = body_json(response).await;
        assert!(
            json.get("valid")
                .map_or(true, |v| v == false || v.is_null()),
            "expected invalid verdict for unsound densified submit, got: {:?}",
            json.get("valid")
        );
    } else {
        assert_eq!(response.status(), StatusCode::NOT_FOUND);
    }
}

#[test]
fn product_day_key_ssot_and_daily_puzzle_completers_oracle_recipe() {
    use puzzled_core::puzzle_play::daily_time::{
        product_day_key, product_day_key_string, DAY_KEY_TIMEZONE,
    };
    use puzzled_core::puzzle_play::game_slugs::ModuleClass;
    use puzzled_core::puzzle_play::ritual_completion::{
        compute_drc, compute_hrc, compute_today_overview, qualifies_as_ritual, RitualCompletionRow,
        RitualOverviewRow, RitualQualifyInput, HABITUAL_MIN_DAYS, HABITUAL_WINDOW_DAYS,
    };

    assert_eq!(DAY_KEY_TIMEZONE, "Asia/Hong_Kong");
    let now = chrono::Utc::now();
    let key = product_day_key_string(now);
    assert_eq!(key.len(), 10);
    assert_eq!(product_day_key(now).format("%Y-%m-%d").to_string(), key);
    assert!(qualifies_as_ritual(RitualQualifyInput {
        game_module_id: "sudoku",
        mode: "daily",
        status: "won",
        is_dry_run: false,
    }));
    assert!(!qualifies_as_ritual(RitualQualifyInput {
        game_module_id: "sudoku",
        mode: "archive",
        status: "won",
        is_dry_run: false,
    }));
    let rows = [RitualCompletionRow {
        user_id: "u1".into(),
        day_key: key.clone(),
        module_class: ModuleClass::PuzzleRitual,
        is_ritual: true,
    }];
    assert_eq!(compute_drc(&key, &rows), 1);
    assert_eq!(compute_hrc(&key, &rows), 0);
    let overview_rows = [RitualOverviewRow {
        user_id: "u1".into(),
        day_key: key.clone(),
        game_module_id: "sudoku".into(),
        module_class: ModuleClass::PuzzleRitual,
        is_ritual: true,
    }];
    let overview = compute_today_overview(&key, &overview_rows);
    assert_eq!(overview.player_count, compute_drc(&key, &rows));
    assert_eq!(overview.completions, vec![("sudoku".into(), 1)]);
    assert_eq!(HABITUAL_MIN_DAYS, 4);
    assert_eq!(HABITUAL_WINDOW_DAYS, 7);
}

/// Dogfood residual (live tip ff366b48): re-SubmitGuess without stored
/// puzzle_id returned 200 valid:true and inserted a second game_sessions
/// row. Guard must run for daily content day even when pid is None.
#[test]
fn submit_already_played_guard_not_gated_on_puzzle_id() {
    use puzzled_core::puzzle_play::game_slugs::ModuleClass;
    use puzzled_core::puzzle_play::ritual_completion::{
        ritual_already_finished, submit_must_guard_already_played, RitualCompletionRow,
    };

    assert!(
        submit_must_guard_already_played(true, None, true),
        "store + content day known => guard even without puzzle_id"
    );
    let prior = [RitualCompletionRow {
        user_id: "f715210b-9df3-4945-b5bd-94fc4609bc30".into(),
        day_key: "2026-08-12".into(),
        module_class: ModuleClass::PuzzleRitual,
        is_ritual: true,
    }];
    assert!(ritual_already_finished(
        &prior,
        "f715210b-9df3-4945-b5bd-94fc4609bc30",
        "2026-08-12",
        "sudoku",
    ));
}
