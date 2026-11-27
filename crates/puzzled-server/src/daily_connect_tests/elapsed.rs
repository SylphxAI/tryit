use crate::test_support::{body_json, build_connect_request_with_auth, fresh_database, token};
use crate::{router, AppState};
use axum::{body::Body, http::StatusCode};
use chrono::Utc;
use puzzled_core::puzzle_play::daily_time::product_day_key;
use serde_json::json;
use tower::ServiceExt;
use uuid::Uuid;

#[tokio::test]
async fn connect_finish_uses_storage_bounded_elapsed_for_scoring_and_persistence() {
    let Some(pool) = fresh_database().await else {
        return;
    };
    let app = router(AppState::new(Some(pool.clone())));
    let today = product_day_key(Utc::now());
    let ceiling = 2_147_483_647;
    for (date, mode) in [(today, "daily"), (today.pred_opt().unwrap(), "archive")] {
        let daily = mode == "daily";
        let puzzle: Uuid = sqlx::query_scalar(
            r#"INSERT INTO daily_puzzles (game_slug, puzzle_date, puzzle_data, solution)
               VALUES ('nonogram', $1, '{}', '{"grid":[[true,false],[false,true]]}') RETURNING id"#,
        )
        .bind(date.and_hms_opt(0, 0, 0).unwrap())
        .fetch_one(&pool)
        .await
        .unwrap();
        let submit = |user: Uuid, elapsed: u64, grid: [[bool; 2]; 2]| {
            let app = app.clone();
            async move {
                let payload = json!({
                    "gameSlug": "nonogram", "puzzleId": puzzle, "puzzleDate": date,
                    "status": "won", "attempts": 1, "timeSpentMs": elapsed.to_string(),
                    "submissionJson": json!({"finalGrid": grid, "errors": 1}).to_string(),
                });
                let response = app
                    .oneshot(build_connect_request_with_auth(
                        "/puzzled.v1.PuzzleService/SubmitGuess",
                        Body::from(payload.to_string()),
                        &token(&user.to_string()),
                    ))
                    .await
                    .unwrap();
                (response.status(), body_json(response).await)
            }
        };

        for (elapsed, stored, score) in [
            (61_234, 61_234, 445),
            (ceiling as u64, ceiling, 100),
            (ceiling as u64 + 1, ceiling, 100),
            (u64::MAX, ceiling, 100),
            // If only persistence clamps, this input wraps the game's u32
            // time penalty to zero and gets a different score.
            ((1_u64 << 32) * 2_000, ceiling, 100),
        ] {
            let user = Uuid::now_v7();
            if elapsed == u64::MAX {
                let (status, body) = submit(user, elapsed, [[true, true], [false, false]]).await;
                assert_eq!(status, StatusCode::OK, "{body}");
                assert_ne!(body["valid"], true);
                assert!(body.get("score").is_none() && body.get("revealJson").is_none());
                let counts: (i64, i64) = sqlx::query_as(
                    "SELECT (SELECT count(*) FROM game_sessions WHERE user_id=$1),
                            (SELECT count(*) FROM daily_free_picks WHERE user_id=$1)",
                )
                .bind(user)
                .fetch_one(&pool)
                .await
                .unwrap();
                assert_eq!(counts, (0, 0));
            }

            let grid = [[false, true], [true, false]];
            let (status, body) = submit(user, elapsed, grid).await;
            assert_eq!(status, StatusCode::OK, "{mode} {elapsed}: {body}");
            assert_eq!(body["valid"], true, "{mode} {elapsed}: {body}");
            assert_eq!(body["score"], score, "{mode} {elapsed}");
            let (status, body) = submit(user, 1, grid).await;
            assert_eq!(status, StatusCode::CONFLICT, "{body}");
            assert_eq!(body["message"], "already_played");

            type Row = (i32, i32, String, bool, chrono::NaiveDate, Option<String>);
            let rows: Vec<Row> = sqlx::query_as(
                "SELECT time_spent_ms,score,mode::text,is_ritual,puzzle_date::date,day_key
                 FROM game_sessions WHERE user_id=$1",
            )
            .bind(user)
            .fetch_all(&pool)
            .await
            .unwrap();
            assert_eq!(
                rows,
                vec![(
                    stored,
                    score,
                    mode.to_string(),
                    daily,
                    date,
                    daily.then(|| today.to_string())
                )],
                "{mode} {elapsed}",
            );
            let picks: Vec<(String, chrono::NaiveDate)> =
                sqlx::query_as("SELECT game_slug,day_key FROM daily_free_picks WHERE user_id=$1")
                    .bind(user)
                    .fetch_all(&pool)
                    .await
                    .unwrap();
            assert_eq!(
                picks,
                if daily {
                    vec![("nonogram".into(), today)]
                } else {
                    vec![]
                }
            );
        }
    }
    pool.close().await;
}
