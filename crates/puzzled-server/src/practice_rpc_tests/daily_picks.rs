use std::sync::Arc;

use axum::http::StatusCode;
use puzzled_core::puzzle_play::application::practice::practice_internal_seed;
use puzzled_core::puzzle_play::generate::generate_seeded;
use serde_json::json;

use super::{fresh_database, ritual_row_counts, rpc, spawn_money, token, Fake, PAID, SEED};
use crate::{router, AppState};

pub(super) async fn plus_practice_preserves_same_account_daily_picks_before_and_after() {
    let Some(pool) = fresh_database().await else {
        return;
    };
    let fake: Fake = Arc::default();
    fake.lock().unwrap().paid.push(PAID.into());
    let app = router(AppState::new(Some(pool.clone())).with_money(Some(spawn_money(fake).await)));
    let paid = token(PAID);
    let (status, daily) = rpc(
        &app,
        "GetDaily",
        json!({"gameSlug": "word-guess"}),
        Some(&paid),
        None,
    )
    .await;
    assert_eq!(status, StatusCode::OK, "{daily}");
    // Today's free picks are admitted before checking Plus; StartDaily claims one.
    assert_eq!(daily["requiresStart"], true);
    let (status, started) = rpc(
        &app,
        "StartDaily",
        json!({"gameSlug": "word-guess", "puzzleDate": daily["puzzleDate"]}),
        Some(&paid),
        None,
    )
    .await;
    assert_eq!(status, StatusCode::OK, "{started}");
    let rows_before = ritual_row_counts(&pool).await;
    assert_eq!(rows_before, (1, 0));

    let read_progress = || {
        rpc(
            &app,
            "GetTodayProgress",
            json!({"gameSlugs": ["word-guess", "sudoku"]}),
            Some(&paid),
            None,
        )
    };
    let (status, before) = read_progress().await;
    assert_eq!(status, StatusCode::OK, "{before}");
    assert_eq!(before["dayKey"], daily["puzzleDate"]);
    assert_eq!(before["freePicks"]["gameSlugs"], json!(["word-guess"]));

    let params =
        json!({"gameSlug": "sudoku", "practiceSeed": SEED.to_string(), "difficulty": "easy"});
    let (status, board) = rpc(&app, "GetPracticePuzzle", params.clone(), Some(&paid), None).await;
    assert_eq!(status, StatusCode::OK, "{board}");
    assert_eq!(board["practiceSeed"], params["practiceSeed"]);
    assert_eq!(board["difficulty"], params["difficulty"]);
    let (_, solution) = generate_seeded(
        "sudoku",
        practice_internal_seed("sudoku", SEED),
        Some("easy"),
    )
    .unwrap();
    let mut submit = params;
    submit["status"] = json!("won");
    submit["timeSpentMs"] = json!("60000");
    submit["attempts"] = json!(1);
    submit["submissionJson"] =
        json!(json!({"finalGrid": solution["grid"], "mistakes": 0}).to_string());
    let (submit_status, verdict) = rpc(&app, "SubmitPractice", submit, Some(&paid), None).await;
    assert_eq!(submit_status, StatusCode::OK, "{verdict}");
    assert_eq!(verdict["valid"], true);
    assert_eq!(verdict["status"], "won");

    let (status, after) = read_progress().await;
    assert_eq!(status, StatusCode::OK, "{after}");
    assert_eq!(after["dayKey"], before["dayKey"]);
    assert_eq!(
        after["freePicks"].to_string(),
        before["freePicks"].to_string()
    );
    let rows_after = ritual_row_counts(&pool).await;
    assert_eq!(rows_after, rows_before);
    // The wire contract returns a list, not a separate count.
    for (phase, progress, rows) in [
        ("before", before, rows_before),
        ("after", after, rows_after),
    ] {
        let slugs = progress["freePicks"]["gameSlugs"].as_array().unwrap();
        eprintln!(
            "GetTodayProgress {phase}: {}",
            json!({
                "freePicks": {"count": slugs.len(), "gameSlugs": slugs},
                "daily_free_picks": rows.0,
                "game_sessions": rows.1,
            })
        );
    }
    eprintln!(
        "SubmitPractice: {}",
        json!({
            "httpStatus": submit_status.as_u16(), "valid": verdict["valid"], "status": verdict["status"],
        })
    );
}
