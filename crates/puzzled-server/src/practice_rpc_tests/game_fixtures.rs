use puzzled_core::puzzle_play::generate;
use serde_json::{json, Value};

pub(super) fn winning_input(game: &str, solution: &Value, data: &Value) -> Value {
    match game {
        "sudoku" => json!({"finalGrid": solution["grid"], "mistakes": 0}),
        "word-guess" => json!({"guesses": [solution["word"]]}),
        "quad-words" => generate::quad_words::solution_submission(solution),
        "nonogram" => generate::nonogram::solution_submission(solution),
        "pattern-match" => generate::pattern_match::solution_submission(solution),
        "killer-sudoku" => generate::killer_sudoku::solution_submission(solution),
        "duo" => generate::duo::solution_submission(solution),
        "arithmo" => generate::arithmo::solution_submission(solution),
        "block-slide" => generate::block_slide::solution_submission(solution),
        "pip-place" => generate::pip_place::solution_submission(solution),
        "number-path" => generate::number_path::solution_submission(solution),
        "word-search" => generate::word_search::solution_submission(solution),
        "word-ladder" => generate::word_ladder::solution_submission(solution),
        "word-hive" => generate::word_hive::solution_submission(solution),
        "word-box" => generate::word_box::solution_submission(solution),
        "cryptogram" => generate::cryptogram::solution_submission(solution),
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

pub(super) fn assert_public_keys(game: &str, data: &Value) {
    let expected: &[&str] = match game {
        "sudoku" => &["difficulty", "grid"],
        "word-guess" => &["maxAttempts", "wordLength"],
        "quad-words" => &[],
        "crowns" => &["regions", "size"],
        "nonogram" => &["colClues", "height", "rowClues", "theme", "width"],
        "pattern-match" => &["cards", "totalSets"],
        "killer-sudoku" => &["cages", "grid"],
        "duo" => &["initialGrid", "size"],
        "arithmo" => &["length"],
        // The minimum is the public par. It does not encode the moves to solve it.
        "block-slide" => &[
            "blocks",
            "exitX",
            "exitY",
            "gridHeight",
            "gridWidth",
            "minMoves",
        ],
        "pip-place" => &["cols", "maxPip", "regionOf", "regions", "rows"],
        "number-path" => &["clues", "size"],
        // The word list is a clue; the coordinates are the solution.
        "word-search" => &["grid", "theme", "wordCount", "words"],
        "word-ladder" => &["endWord", "minSteps", "startWord", "wordLength"],
        "word-hive" => &[
            "centerLetter",
            "maxScore",
            "outerLetters",
            "totalPangrams",
            "totalWords",
        ],
        "word-box" => &["box"],
        "cryptogram" => &[
            "author",
            "category",
            "encryptedText",
            "maxHints",
            "uniqueLetters",
        ],
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
        "queens",
        "validSets",
        "placements",
        "path",
        "validWords",
        "pangrams",
        "originalText",
        "cipher",
        "reverseCipher",
        "allLetters",
    ]
    .into_iter()
    .chain((game != "word-search").then_some("words"))
    {
        assert!(
            !data.to_string().contains(&format!("\"{key}\"")),
            "{game}: {key}"
        );
    }
    let grid_key = if game == "duo" { "initialGrid" } else { "grid" };
    if matches!(game, "sudoku" | "killer-sudoku" | "duo") {
        assert!(data[grid_key].as_array().unwrap().iter().any(|row| row
            .as_array()
            .unwrap()
            .iter()
            .any(Value::is_null)));
    }
}
