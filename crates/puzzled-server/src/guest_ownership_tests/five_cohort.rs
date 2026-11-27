use axum::http::StatusCode;
use serde_json::json;
use uuid::Uuid;

use super::support::puzzle_request;
use crate::capabilities::{daily_pipeline, identity_access::adapters::guest_credentials};
use crate::test_support::fresh_database;
use crate::{router, AppState};
use puzzled_core::puzzle_play::daily_time::product_day_key;

pub(super) async fn five_cohort_guards_both_writers_and_preserves_legacy() {
    let Some(pool) = fresh_database().await else {
        return;
    };
    let day = product_day_key(chrono::Utc::now());
    let yesterday = day.pred_opt().unwrap();
    let puzzle = daily_pipeline::resolve(Some(&pool), "word-guess", day, None)
        .await
        .unwrap();
    let id = Uuid::parse_str(puzzle.id.as_deref().unwrap()).unwrap();
    let legacy = daily_pipeline::resolve(Some(&pool), "word-guess", yesterday, None)
        .await
        .unwrap();
    let legacy_id = legacy.id.as_deref().unwrap();
    let register =
        "INSERT INTO five_write_cohorts (day_key, cohort, puzzle_id) VALUES ($1, 'durable-v1', $2)";
    assert!(sqlx::query(register)
        .bind(yesterday)
        .bind(id)
        .execute(&pool)
        .await
        .is_err());
    sqlx::query(register)
        .bind(day)
        .bind(id)
        .execute(&pool)
        .await
        .unwrap();

    let app = router(AppState::new(Some(pool.clone())));
    let cookie = guest_credentials::mint_cookie(None).unwrap();
    let cookie = cookie.split(';').next().unwrap();
    let guess = json!({"gameSlug":"word-guess","guessJson":"{\"word\":\"crane\"}"});
    let finish = json!({"gameSlug":"word-guess","status":"won","attempts":1,
        "puzzleId": id, "puzzleDate": day.to_string(),
        "submissionJson":json!({"guesses":[puzzle.solution["word"]]}).to_string()});
    let mut with_id = guess.clone();
    with_id["puzzleId"] = json!(id);
    let mut wrong_id = guess.clone();
    wrong_id["puzzleId"] = json!(legacy_id);
    let mut wrong_day = with_id.clone();
    wrong_day["puzzleDate"] = json!(yesterday.to_string());
    for (method, request) in [
        ("CheckGuess", guess.clone()),
        ("CheckGuess", with_id),
        ("CheckGuess", wrong_id.clone()),
        ("CheckGuess", wrong_day),
        ("SubmitGuess", finish.clone()),
    ] {
        let (status, body) = puzzle_request(&app, method, cookie, None, request).await;
        assert_eq!(status, StatusCode::BAD_REQUEST, "{method}: {body}");
        assert_eq!(body["code"], "failed_precondition");
        assert_eq!(body["message"], "five_cohort_closed");
    }
    let counts: (i64, i64, i64) = sqlx::query_as("SELECT (SELECT count(*) FROM guest_credentials), (SELECT count(*) FROM daily_free_picks), (SELECT count(*) FROM game_sessions)")
        .fetch_one(&pool).await.unwrap();
    assert_eq!(counts, (0, 0, 0));

    let mut legacy_finish = finish.clone();
    legacy_finish["puzzleId"] = json!(legacy_id);
    legacy_finish["puzzleDate"] = json!(yesterday.to_string());
    legacy_finish["submissionJson"] =
        json!(json!({"guesses":[legacy.solution["word"]]}).to_string());
    let (status, body) = puzzle_request(&app, "SubmitGuess", cookie, None, legacy_finish).await;
    assert_eq!(status, StatusCode::OK, "{body}");
    assert_eq!(body["valid"], true);

    let recorded: (String, bool) = sqlx::query_as("UPDATE five_write_cohorts SET admitted_by = 'test-operator' WHERE admitted_at IS NULL RETURNING admitted_by, admitted_at IS NOT NULL")
        .fetch_one(&pool).await.unwrap();
    assert_eq!(recorded, ("test-operator".into(), true));
    assert!(
        sqlx::query("UPDATE five_write_cohorts SET admitted_by = 'second-actor'")
            .execute(&pool)
            .await
            .is_err()
    );
    assert!(sqlx::query("DELETE FROM five_write_cohorts")
        .execute(&pool)
        .await
        .is_err());
    let (status, body) = puzzle_request(&app, "CheckGuess", cookie, None, wrong_id).await;
    assert_eq!(status, StatusCode::BAD_REQUEST, "{body}");
    assert_eq!(body["message"], "five_cohort_closed");
    let (status, body) = puzzle_request(&app, "CheckGuess", cookie, None, guess).await;
    assert_eq!(status, StatusCode::OK, "{body}");
    let daily = json!({"gameSlug":"word-guess","puzzleDate":day.to_string()});
    let (status, body) = puzzle_request(&app, "GetDaily", cookie, None, daily.clone()).await;
    assert_eq!(status, StatusCode::OK, "{body}");
    assert_eq!(body["puzzleId"], id.to_string());
    assert_ne!(body["hasCompleted"], true);
    let (status, body) = puzzle_request(&app, "SubmitGuess", cookie, None, finish).await;
    assert_eq!(status, StatusCode::OK, "{body}");
    assert_eq!(body["valid"], true);
    let (status, body) = puzzle_request(&app, "GetDaily", cookie, None, daily).await;
    assert_eq!(status, StatusCode::OK, "{body}");
    assert_eq!(body["hasCompleted"], true);
    pool.close().await;
}
