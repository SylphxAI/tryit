//! Exercise the Connect routes against a migrated scratch database and Money stub.

use puzzled_core::puzzle_play::application::guess_grading::guess_limit;
use puzzled_core::puzzle_play::application::practice::{practice_internal_seed, PRACTICE_GAMES};
use puzzled_core::puzzle_play::generate::{self, generate_seeded};

use super::*;
use crate::capabilities::identity_access::adapters::guest_credentials;

const SEED: i64 = 20_261_125;
const PRACTICE_RPCS: [&str; 3] = ["GetPracticePuzzle", "CheckPracticeGuess", "SubmitPractice"];

async fn rpc(
    app: &Router,
    method: &str,
    body: Value,
    account: Option<&str>,
    cookie: Option<&str>,
) -> (StatusCode, Value) {
    let mut req = Request::builder()
        .method(Method::POST)
        .uri(format!("/puzzled.v1.PuzzleService/{method}"))
        .header("content-type", "application/json")
        .header("connect-protocol-version", "1");
    if method == "StartDaily" {
        req = req.header(
            "origin",
            crate::shared::public_origin::public_origin().unwrap(),
        );
    }
    if let Some(jwt) = account {
        req = req.header("authorization", format!("Bearer {jwt}"));
    }
    if let Some(cookie) = cookie {
        req = req.header("cookie", cookie);
    }
    let res = app
        .clone()
        .oneshot(req.body(Body::from(body.to_string())).unwrap())
        .await
        .unwrap();
    let status = res.status();
    let bytes = to_bytes(res.into_body(), 1024 * 1024).await.unwrap();
    (status, serde_json::from_slice(&bytes).unwrap())
}

fn json_field(body: &Value, key: &str) -> Value {
    serde_json::from_str(body[key].as_str().unwrap()).unwrap()
}

fn assert_denied((status, body): (StatusCode, Value), expected: StatusCode, message: &str) {
    assert_eq!(status, expected, "{body}");
    assert_eq!(body["message"], message);
    assert_eq!(
        body["code"],
        if expected == StatusCode::UNAUTHORIZED {
            "unauthenticated"
        } else {
            "permission_denied"
        }
    );
}

async fn ritual_row_counts(pool: &sqlx::PgPool) -> (i64, i64) {
    sqlx::query_as(
        "SELECT (SELECT count(*) FROM daily_free_picks), (SELECT count(*) FROM game_sessions)",
    )
    .fetch_one(pool)
    .await
    .unwrap()
}

async fn assert_no_ritual_rows(pool: &sqlx::PgPool) {
    assert_eq!(ritual_row_counts(pool).await, (0, 0));
}

#[tokio::test]
async fn plus_practice_preserves_same_account_daily_picks_before_and_after() {
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

#[tokio::test]
async fn practice_requires_an_account_and_fails_closed_on_money_errors() {
    let Some(pool) = fresh_database().await else {
        return;
    };
    let guest = guest_credentials::issue(&pool).await.unwrap();
    let cookie = guest.split(';').next().unwrap();
    let unpaid = token(UNPAID);
    let paid = token(PAID);
    let outage = token(OUTAGE);
    let fake: Fake = Arc::default();
    fake.lock().unwrap().paid.push(PAID.into());
    let money = spawn_money(fake.clone()).await;
    let app = router(AppState::new(Some(pool.clone())).with_money(Some(money)));
    // Fail the entitlement read while catalogue is open. Use an uncached subject.
    for method in PRACTICE_RPCS {
        for browser_cookie in [None, Some(cookie)] {
            assert_denied(
                rpc(&app, method, json!({}), None, browser_cookie).await,
                StatusCode::UNAUTHORIZED,
                "identity_required_for_practice",
            );
        }
        assert_denied(
            rpc(&app, method, json!({}), Some(&unpaid), None).await,
            StatusCode::FORBIDDEN,
            "plus_required_for_practice",
        );
    }
    fake.lock().unwrap().down = true;
    for method in PRACTICE_RPCS {
        assert_denied(
            rpc(&app, method, json!({}), Some(&outage), None).await,
            StatusCode::FORBIDDEN,
            "plus_required_for_practice",
        );
    }

    // No sellable catalogue is different from a catalogue that cannot answer.
    let listener = tokio::net::TcpListener::bind("127.0.0.1:0").await.unwrap();
    let addr = listener.local_addr().unwrap();
    let broken = Router::new().route(
        "/v1/orgs/o/projects/p/envs/e/price_catalogs/default",
        get(|| async { (StatusCode::SERVICE_UNAVAILABLE, Json(json!({}))) }),
    );
    let server = tokio::spawn(async move { axum::serve(listener, broken).await.unwrap() });
    let money = Money::new(
        &format!("http://{addr}/v1/orgs/o/projects/p/envs/e"),
        "sk_test",
        "https://puzzled.test",
    );
    let broken_app = router(AppState::new(Some(pool.clone())).with_money(Some(money)));
    for method in PRACTICE_RPCS {
        assert_denied(
            rpc(&broken_app, method, json!({}), Some(&paid), None).await,
            StatusCode::FORBIDDEN,
            "plus_required_for_practice",
        );
    }
    server.abort();
    let closed = router(AppState::new(Some(pool.clone())));
    let (status, body) = rpc(
        &closed,
        "GetPracticePuzzle",
        json!({"gameSlug":"word-guess"}),
        Some(&unpaid),
        None,
    )
    .await;
    assert_eq!(status, StatusCode::OK, "{body}");
    assert_no_ritual_rows(&pool).await;
}

fn winning_input(game: &str, solution: &Value, data: &Value) -> Value {
    match game {
        "sudoku" => json!({"finalGrid": solution["grid"], "mistakes": 0}),
        "word-guess" => json!({"guesses": [solution["word"]]}),
        "quad-words" => generate::quad_words::solution_submission(solution),
        "nonogram" => generate::nonogram::solution_submission(solution),
        "pattern-match" => generate::pattern_match::solution_submission(solution),
        "crowns" => {
            let size = data["size"].as_u64().unwrap() as usize;
            let mut grid = vec![vec![false; size]; size];
            for pair in solution["queens"].as_array().unwrap() {
                grid[pair[0].as_u64().unwrap() as usize][pair[1].as_u64().unwrap() as usize] = true;
            }
            json!({"finalGrid": grid})
        }
        _ => unreachable!("not a practice game"),
    }
}

fn assert_public_keys(game: &str, data: &Value) {
    let expected: &[&str] = match game {
        "sudoku" => &["difficulty", "grid"],
        "word-guess" => &["maxAttempts", "wordLength"],
        "quad-words" => &[],
        "crowns" => &["regions", "size"],
        "nonogram" => &["colClues", "height", "rowClues", "theme", "width"],
        "pattern-match" => &["cards", "totalSets"],
        _ => unreachable!("not a practice game"),
    };
    let map = data.as_object().unwrap();
    assert_eq!(map.len(), expected.len(), "{game}");
    assert!(
        expected.iter().all(|key| map.contains_key(*key)),
        "{game}: {data}"
    );
    for key in [
        "answer",
        "solution",
        "solutionJson",
        "solution_json",
        "word",
        "words",
        "queens",
        "validSets",
    ] {
        assert!(
            !data.to_string().contains(&format!("\"{key}\"")),
            "{game}: {key}"
        );
    }
    if game == "sudoku" {
        assert!(data["grid"].as_array().unwrap().iter().any(|row| row
            .as_array()
            .unwrap()
            .iter()
            .any(Value::is_null)));
    }
}

#[tokio::test]
async fn plus_can_repeat_all_six_games_without_using_the_daily_store() {
    let Some(pool) = fresh_database().await else {
        return;
    };
    let fake: Fake = Arc::default();
    fake.lock().unwrap().paid.push(PAID.into());
    let app = router(AppState::new(Some(pool.clone())).with_money(Some(spawn_money(fake).await)));
    let paid = token(PAID);
    for game in PRACTICE_GAMES {
        let slug = if game == "crowns" { "queens" } else { game };
        let params = json!({"gameSlug":slug,"practiceSeed":SEED.to_string()});
        let (status, board) =
            rpc(&app, "GetPracticePuzzle", params.clone(), Some(&paid), None).await;
        assert_eq!(status, StatusCode::OK, "{game}: {board}");
        assert_eq!(board["gameSlug"], game);
        assert_eq!(board["practiceSeed"], SEED.to_string());
        assert!(board.get("revealJson").is_none());
        let data = json_field(&board, "puzzleDataJson");
        assert_public_keys(game, &data);
        let difficulty = board["difficulty"].as_str();
        let internal = practice_internal_seed(game, SEED) + i64::from(difficulty == Some("medium"));
        let (_, solution) = generate_seeded(game, internal, difficulty).unwrap();
        let mut submit = params.clone();
        submit["status"] = json!("won");
        submit["timeSpentMs"] = json!("60000");
        submit["attempts"] = json!(1);
        submit["submissionJson"] = json!("{}");
        let (status, rejected) =
            rpc(&app, "SubmitPractice", submit.clone(), Some(&paid), None).await;
        assert_eq!(status, StatusCode::OK, "{game}: {rejected}");
        assert_ne!(rejected["valid"], true, "{game}: {rejected}");
        assert!(rejected.get("revealJson").is_none(), "{game}: {rejected}");
        submit["submissionJson"] = json!(winning_input(game, &solution, &data).to_string());
        let (status, accepted) = rpc(&app, "SubmitPractice", submit, Some(&paid), None).await;
        assert_eq!(status, StatusCode::OK, "{game}: {accepted}");
        assert_eq!(accepted["valid"], true, "{game}: {accepted}");
        assert_eq!(accepted["status"], "won");
        assert_eq!(accepted["gameSlug"], game);
        assert_eq!(json_field(&accepted, "revealJson"), solution, "{game}");
        if let Some(limit) = guess_limit(game) {
            let word = if game == "quad-words" {
                &solution["words"][0]
            } else {
                &solution["word"]
            };
            let mut guess = params.clone();
            guess["guessJson"] = json!(json!({"word": word}).to_string());
            for _ in 0..limit {
                let (status, body) =
                    rpc(&app, "CheckPracticeGuess", guess.clone(), Some(&paid), None).await;
                assert_eq!(status, StatusCode::OK, "{game}: {body}");
                let result = json_field(&body, "resultJson");
                let tiles = if game == "quad-words" {
                    &result["boards"][0]
                } else {
                    &result["tiles"]
                };
                assert_eq!(*tiles, json!(vec!["correct"; 5]));
            }
            guess["difficulty"] = json!(" HARD "); // Ignored for games without levels.
            let (status, body) = rpc(&app, "CheckPracticeGuess", guess, Some(&paid), None).await;
            assert_eq!(status, StatusCode::TOO_MANY_REQUESTS, "{game}: {body}");
            assert_eq!(body["message"], "guess_limit_reached");
        }
    }
    let params = json!({"gameSlug":"sudoku"});
    let (status, first) = rpc(&app, "GetPracticePuzzle", params.clone(), Some(&paid), None).await;
    let (next_status, next) = rpc(&app, "GetPracticePuzzle", params, Some(&paid), None).await;
    assert_eq!((status, next_status), (StatusCode::OK, StatusCode::OK));
    for board in [&first, &next] {
        assert!(
            board["practiceSeed"]
                .as_str()
                .unwrap()
                .parse::<i64>()
                .unwrap()
                > 0
        );
    }
    assert_ne!(first["practiceSeed"], next["practiceSeed"]);
    for method in PRACTICE_RPCS {
        let (status, body) = rpc(
            &app,
            method,
            json!({"gameSlug":"crossword"}),
            Some(&paid),
            None,
        )
        .await;
        assert_eq!(status, StatusCode::BAD_REQUEST);
        assert_eq!(body["message"], "practice_not_supported");
    }
    assert_no_ritual_rows(&pool).await;
}
