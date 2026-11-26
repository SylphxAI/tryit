use std::sync::Arc;

use axum::http::StatusCode;
use axum::Router;
use puzzled_core::puzzle_play::application::guess_grading::guess_limit;
use puzzled_core::puzzle_play::application::practice::{practice_internal_seed, PRACTICE_GAMES};
use puzzled_core::puzzle_play::generate::{generate_seeded, DIFFICULTIES};
use serde_json::{json, Value};

use super::game_fixtures::{assert_public_keys, winning_input};
use super::{
    assert_no_ritual_rows, fresh_database, json_field, rpc, spawn_money, token, Fake, PAID,
    PRACTICE_RPCS, SEED,
};
use crate::{router, AppState};

async fn assert_practice_grading(
    app: &Router,
    paid: &str,
    game: &str,
    mut params: Value,
    data: &Value,
    solution: &Value,
) {
    let Some(limit) = guess_limit(game) else {
        params["guessJson"] = json!("{}");
        let (status, body) = rpc(app, "CheckPracticeGuess", params, Some(paid), None).await;
        assert_eq!(status, StatusCode::BAD_REQUEST, "{game}: {body}");
        assert_eq!(body["message"], "game_not_graded_per_guess");
        return;
    };
    let mut revealed = Vec::new();
    let mut hint_guesses = serde_json::Map::new();
    for attempt in 0..limit {
        let (input, expected) = match game {
            "arithmo" => {
                assert_eq!(limit, 6);
                (
                    json!({"equation": solution["equation"]}),
                    json!({"tiles": vec!["correct"; 8]}),
                )
            }
            "quad-words" => (
                json!({"word": solution["words"][0]}),
                json!(vec!["correct"; 5]),
            ),
            "word-guess" => (
                json!({"word": solution["word"]}),
                json!({"tiles": vec!["correct"; 5]}),
            ),
            "word-hive" => {
                assert_eq!(limit, 1000);
                let words = solution["validWords"].as_array().unwrap();
                let pangrams = solution["pangrams"].as_array().unwrap();
                assert!(words.len() < limit as usize);
                let word = words.get(attempt as usize);
                (
                    json!({"word": word.cloned().unwrap_or_else(|| json!("ZZZZ"))}),
                    json!({
                        "valid": word.is_some(),
                        "pangram": word.is_some_and(|word| pangrams.contains(word)),
                        "totalWords": words.len(),
                        "totalPangrams": pangrams.len(),
                    }),
                )
            }
            "cryptogram" => {
                assert_eq!(limit, 30);
                assert_eq!(data["maxHints"], 3);
                if attempt < 3 {
                    let encrypted = data["encryptedText"]
                        .as_str()
                        .unwrap()
                        .chars()
                        .filter(char::is_ascii_uppercase)
                        .filter(|ch| !revealed.contains(&ch.to_string()))
                        .min()
                        .unwrap()
                        .to_string();
                    let letter = &solution["reverseCipher"][&encrypted];
                    let input =
                        json!({"hint": true, "guesses": hint_guesses, "revealed": revealed});
                    hint_guesses.insert(encrypted.clone(), letter.clone());
                    revealed.push(encrypted.clone());
                    (input, json!({"encrypted": encrypted, "letter": letter}))
                } else if attempt == limit - 1 {
                    (
                        json!({"guesses": solution["reverseCipher"]}),
                        json!({"solved": true}),
                    )
                } else {
                    (json!({"guesses": hint_guesses}), json!({"solved": false}))
                }
            }
            _ => unreachable!("missing practice grading case for {game}"),
        };
        params["guessJson"] = json!(input.to_string());
        let (status, body) = rpc(app, "CheckPracticeGuess", params.clone(), Some(paid), None).await;
        assert_eq!(status, StatusCode::OK, "{game}: {body}");
        let result = json_field(&body, "resultJson");
        let actual = if game == "quad-words" {
            &result["boards"][0]
        } else {
            &result
        };
        assert_eq!(*actual, expected, "{game}");
    }
    params["difficulty"] = json!(" HARD "); // Ignored for games without levels.
    let (status, body) = rpc(app, "CheckPracticeGuess", params, Some(paid), None).await;
    assert_eq!(status, StatusCode::TOO_MANY_REQUESTS, "{game}: {body}");
    assert_eq!(body["message"], "guess_limit_reached");
}

pub(super) async fn plus_can_finish_every_practice_game_without_using_the_daily_store() {
    let Some(pool) = fresh_database().await else {
        return;
    };
    let fake: Fake = Arc::default();
    fake.lock().unwrap().paid.push(PAID.into());
    let app = router(AppState::new(Some(pool.clone())).with_money(Some(spawn_money(fake).await)));
    let paid = token(PAID);
    let cases = PRACTICE_GAMES.into_iter().flat_map(|game| {
        let levels: &[&str] = if matches!(game, "killer-sudoku" | "block-slide") {
            &DIFFICULTIES
        } else {
            &[""]
        };
        levels.iter().map(move |&level| (game, level))
    });
    for (game, level) in cases {
        let slug = match game {
            "crowns" => "queens",
            "duo" => "tango",
            _ => game,
        };
        let params = json!({"gameSlug":slug,"practiceSeed":SEED.to_string(),"difficulty":level});
        let (status, board) =
            rpc(&app, "GetPracticePuzzle", params.clone(), Some(&paid), None).await;
        assert_eq!(status, StatusCode::OK, "{game}: {board}");
        assert_eq!(board["gameSlug"], game);
        assert_eq!(board["practiceSeed"], SEED.to_string());
        assert!(board.get("revealJson").is_none());
        let data = json_field(&board, "puzzleDataJson");
        assert_public_keys(game, &data);
        let difficulty = board["difficulty"].as_str();
        if !level.is_empty() {
            assert_eq!(difficulty, Some(level), "{game}");
        }
        let offset = DIFFICULTIES
            .iter()
            .position(|&level| Some(level) == difficulty);
        let internal = practice_internal_seed(game, SEED) + offset.unwrap_or(0) as i64;
        let (_, solution) = generate_seeded(game, internal, difficulty).unwrap();
        assert_practice_grading(&app, &paid, game, params.clone(), &data, &solution).await;
        let mut submit = params;
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
