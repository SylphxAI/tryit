use super::support::{absent_percentile, rpc, seed};
use crate::test_support::{fresh_database, token};
use crate::{router, AppState};
use axum::{
    body::{to_bytes, Body},
    http::{Request, StatusCode},
};
use chrono::Utc;
use puzzled_core::puzzle_play::daily_time::product_day_key_string;
use serde_json::{json, Value};
use tower::ServiceExt;
use uuid::Uuid;

pub(super) async fn empty_small_missing_data_and_unavailable_are_honest() {
    let no_db = rpc(
        None,
        None,
        json!({"gameSlug":"sudoku","totalPlayers":100,"betterThan":100}),
    )
    .await;
    absent_percentile(&no_db, "unavailable_data");
    assert_eq!(no_db["stub"], true);
    let Some(pool) = fresh_database().await else {
        return;
    };
    let empty = rpc(Some(&pool), None, json!({"gameSlug":"sudoku"})).await;
    absent_percentile(&empty, "empty_cohort");
    assert_eq!(
        empty
            .get("totalPlayers")
            .and_then(Value::as_i64)
            .unwrap_or(0),
        0
    );
    let me = seed(&pool, "cryptogram", 4).await;
    sqlx::query("UPDATE game_sessions SET hints_used=NULL WHERE attempts=1")
        .execute(&pool)
        .await
        .unwrap();
    let v = rpc(Some(&pool), Some(me), json!({"gameSlug":"cryptogram"})).await;
    absent_percentile(&v, "unavailable_data");
    assert_eq!(v["totalPlayers"], 12);
    let me = seed(&pool, "sudoku", 5).await;
    sqlx::query("DELETE FROM game_sessions WHERE game_slug='sudoku' AND attempts>=10")
        .execute(&pool)
        .await
        .unwrap();
    let v = rpc(Some(&pool), Some(me), json!({"gameSlug":"sudoku"})).await;
    absent_percentile(&v, "insufficient_cohort");
    assert_eq!(v["totalPlayers"], 9);
    // Ten is sufficient; ties count in the denominator, never as beaten.
    sqlx::query("INSERT INTO game_sessions (user_id,game_slug,mode,status,time_spent_ms,day_key,is_ritual,module_class) VALUES ($1,'sudoku','daily','won',6000,$2,true,'puzzle_ritual')")
        .bind(Uuid::now_v7()).bind(product_day_key_string(Utc::now())).execute(&pool).await.unwrap();
    let v = rpc(Some(&pool), Some(me), json!({"gameSlug":"sudoku"})).await;
    assert_eq!(v["totalPlayers"], 10);
    assert_eq!(v["percentile"], 30);
    pool.close().await;
}

pub(super) async fn submission_persists_hints_and_verification_exclusion() {
    let Some(pool) = fresh_database().await else {
        return;
    };
    let day = puzzled_core::puzzle_play::daily_time::product_day_key(Utc::now());
    let puzzle = Uuid::now_v7();
    sqlx::query("INSERT INTO daily_puzzles (id,game_slug,puzzle_date,puzzle_data,solution) VALUES ($1,'cryptogram',$2,'{\"encryptedText\":\"AB\"}'::jsonb,'{\"reverseCipher\":{\"A\":\"C\",\"B\":\"D\"}}'::jsonb)")
        .bind(puzzle).bind(day.and_hms_opt(0,0,0).unwrap()).execute(&pool).await.unwrap();
    // Normal accepted play, current verification and the old harness are all
    // validated identically. Only the latter two opt out of comparisons.
    for marker in ["player", "header", "old-harness"] {
        let me = Uuid::now_v7();
        let mut request = Request::builder()
            .method("POST")
            .uri("/puzzled.v1.PuzzleService/SubmitGuess")
            .header("content-type", "application/json")
            .header(
                "authorization",
                format!("Bearer {}", token(&me.to_string())),
            );
        if marker == "header" {
            request = request.header("x-puzzled-verification", "1");
        }
        if marker == "old-harness" {
            request = request.header("user-agent", "puzzled-verify-live/1 test");
        }
        let response = router(AppState::new(Some(pool.clone()))).oneshot(request.body(Body::from(json!({
            "gameSlug":"cryptogram", "puzzleId":puzzle.to_string(), "status":"won",
            "attempts":1,"timeSpentMs":"5000",
            "submissionJson":json!({"guesses":{"A":"C","B":"D"},"hintsUsed":2}).to_string()
        }).to_string())).unwrap()).await.unwrap();
        assert_eq!(response.status(), StatusCode::OK);
        let accepted: Value =
            serde_json::from_slice(&to_bytes(response.into_body(), usize::MAX).await.unwrap())
                .unwrap();
        assert_eq!(accepted["valid"], true, "{accepted}");
        let (hints, excluded): (Option<i64>, bool) = sqlx::query_as(
            "SELECT hints_used,comparison_excluded FROM game_sessions WHERE user_id=$1",
        )
        .bind(me)
        .fetch_one(&pool)
        .await
        .unwrap();
        assert_eq!(hints, Some(2));
        assert_eq!(excluded, marker != "player");
        let v = rpc(Some(&pool), Some(me), json!({"gameSlug":"cryptogram"})).await;
        assert_eq!(v["totalPlayers"], 1);
        absent_percentile(
            &v,
            if marker == "player" {
                "insufficient_cohort"
            } else {
                "accepted_finish_required"
            },
        );
    }
    pool.close().await;
}

pub(super) async fn archive_id_cannot_masquerade_as_today() {
    let Some(pool) = fresh_database().await else {
        return;
    };
    let yesterday = puzzled_core::puzzle_play::daily_time::product_day_key(Utc::now())
        .pred_opt()
        .unwrap();
    let puzzle = Uuid::now_v7();
    sqlx::query("INSERT INTO daily_puzzles (id,game_slug,puzzle_date,puzzle_data,solution) VALUES ($1,'cryptogram',$2,'{\"encryptedText\":\"AB\"}'::jsonb,'{\"reverseCipher\":{\"A\":\"C\",\"B\":\"D\"}}'::jsonb)")
        .bind(puzzle).bind(yesterday.and_hms_opt(0,0,0).unwrap()).execute(&pool).await.unwrap();
    let me = Uuid::now_v7();
    for is_archive in [false, true] {
        let mut body = json!({"gameSlug":"cryptogram", "puzzleId":puzzle.to_string(),
            "status":"won", "attempts":1, "timeSpentMs":"5000",
            "submissionJson":json!({"guesses":{"A":"C","B":"D"},"hintsUsed":0}).to_string()});
        if is_archive {
            body["puzzleDate"] = json!(yesterday.to_string());
            body["mode"] = json!("archive");
        }
        let request = Request::builder()
            .method("POST")
            .uri("/puzzled.v1.PuzzleService/SubmitGuess")
            .header("content-type", "application/json")
            .header(
                "authorization",
                format!("Bearer {}", token(&me.to_string())),
            )
            .body(Body::from(body.to_string()))
            .unwrap();
        let response = router(AppState::new(Some(pool.clone())))
            .oneshot(request)
            .await
            .unwrap();
        assert_eq!(
            response.status(),
            if is_archive {
                StatusCode::OK
            } else {
                StatusCode::BAD_REQUEST
            }
        );
        if is_archive {
            let accepted: Value =
                serde_json::from_slice(&to_bytes(response.into_body(), usize::MAX).await.unwrap())
                    .unwrap();
            assert_eq!(accepted["valid"], true, "{accepted}");
        }
        absent_percentile(
            &rpc(Some(&pool), Some(me), json!({"gameSlug":"cryptogram"})).await,
            "empty_cohort",
        );
    }
    let count: i64 = sqlx::query_scalar(
        "SELECT COUNT(*) FROM game_sessions WHERE user_id=$1 AND mode='archive' AND NOT is_ritual",
    )
    .bind(me)
    .fetch_one(&pool)
    .await
    .unwrap();
    assert_eq!(count, 1);
    pool.close().await;
}
