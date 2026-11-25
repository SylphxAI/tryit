use super::{has_server_validator, validate_submission, SubmissionEnvelope, SubmissionStatus};
use serde_json::{json, Value};

fn env(data: Value) -> SubmissionEnvelope {
    SubmissionEnvelope {
        status: SubmissionStatus::Won,
        attempts: 1,
        time_spent_ms: 1000,
        data,
    }
}

#[test]
fn sudoku_accepts_correct_grid() {
    let solution = json!({ "grid": [[1,2],[3,4]] });
    let data = env(json!({ "finalGrid": [[1,2],[3,4]] }));
    // 2x2 is not a valid sudoku size; expect a validation error, not a panic.
    let v = validate_submission("sudoku", &json!({}), &solution, &data);
    assert!(!v.valid);
}

fn ambiguous_sudoku() -> (Value, Value, Vec<Vec<u8>>) {
    let generated = crate::capabilities::puzzle_play::sudoku::generate_sudoku_puzzle(
        42,
        crate::capabilities::puzzle_play::sudoku::SudokuDifficulty::Easy,
    );
    let canonical = generated.solution.grid;
    // Removing both digits admits their global swap, preserving every clue.
    let clues: Vec<Vec<Option<u8>>> = canonical
        .iter()
        .map(|row| {
            row.iter()
                .map(|v| if *v <= 2 { None } else { Some(*v) })
                .collect()
        })
        .collect();
    let alternate = canonical
        .iter()
        .map(|row| {
            row.iter()
                .map(|v| match v {
                    1 => 2,
                    2 => 1,
                    _ => *v,
                })
                .collect()
        })
        .collect();
    (
        json!({"grid": clues, "difficulty": "easy"}),
        json!({"grid": canonical}),
        alternate,
    )
}

#[test]
fn sudoku_accepts_alternate_completion_against_frozen_clues() {
    let (puzzle, solution, alternate) = ambiguous_sudoku();
    assert_ne!(json!(alternate), solution["grid"]);
    let verdict = validate_submission(
        "sudoku",
        &puzzle,
        &solution,
        &env(json!({"finalGrid": alternate})),
    );
    assert!(verdict.valid, "{verdict:?}");
    assert_eq!(verdict.status, Some(SubmissionStatus::Won));
    assert_eq!(verdict.score, Some(999));
    let mut loss = env(json!({"finalGrid": alternate}));
    loss.status = SubmissionStatus::Lost;
    assert!(!validate_submission("sudoku", &puzzle, &solution, &loss).valid);
}

#[test]
fn sudoku_rejects_valid_grid_that_changes_a_given() {
    let (mut puzzle, solution, alternate) = ambiguous_sudoku();
    // Alternate remains a fully valid Sudoku, but this new clue forbids it.
    let canonical: Vec<Vec<u8>> = serde_json::from_value(solution["grid"].clone()).unwrap();
    let (r, c) = canonical
        .iter()
        .enumerate()
        .find_map(|(r, row)| row.iter().position(|v| *v <= 2).map(|c| (r, c)))
        .unwrap();
    puzzle["grid"][r][c] = json!(canonical[r][c]);
    assert!(
        !validate_submission(
            "sudoku",
            &puzzle,
            &solution,
            &env(json!({"finalGrid": alternate}))
        )
        .valid
    );
}

#[test]
fn sudoku_rejects_invalid_grids_and_malformed_clues_without_panicking() {
    let (puzzle, solution, alternate) = ambiguous_sudoku();
    for value in [
        json!(null),
        json!(0),
        json!(10),
        json!(-1),
        json!(1.5),
        json!("1"),
        json!(true),
    ] {
        let mut grid = json!(alternate);
        grid[8][8] = value;
        assert!(
            !validate_submission(
                "sudoku",
                &puzzle,
                &solution,
                &env(json!({"finalGrid": grid}))
            )
            .valid
        );
    }
    let mut grid = alternate.clone();
    grid[8][8] = grid[8][7];
    assert!(
        !validate_submission(
            "sudoku",
            &puzzle,
            &solution,
            &env(json!({"finalGrid": grid}))
        )
        .valid
    );
    // A Latin square satisfies row/column uniqueness, but violates 3x3 boxes.
    let latin: Vec<Vec<u8>> = (0..9)
        .map(|r| (0..9).map(|c| ((r + c) % 9 + 1) as u8).collect())
        .collect();
    let empty = json!({"grid": vec![vec![None::<u8>;9];9], "difficulty": "easy"});
    assert!(
        !validate_submission(
            "sudoku",
            &empty,
            &solution,
            &env(json!({"finalGrid": latin}))
        )
        .valid
    );
    let mut short = json!(alternate);
    short[8] = json!([1]);
    assert!(
        !validate_submission(
            "sudoku",
            &puzzle,
            &solution,
            &env(json!({"finalGrid": short}))
        )
        .valid
    );
    for clues in [json!({}), json!({"grid": [[null]], "difficulty": "easy"})] {
        assert!(
            !validate_submission(
                "sudoku",
                &clues,
                &solution,
                &env(json!({"finalGrid": alternate}))
            )
            .valid
        );
    }
}

#[test]
fn word_guess_validates_guesses() {
    let solution = json!({ "word": "HELLO" });
    let data = env(json!({ "guesses": ["HELLO"] }));
    let v = validate_submission("word-guess", &json!({}), &solution, &data);
    assert!(v.valid, "expected valid: {v:?}");
    assert_eq!(v.score, Some(100));
}

#[test]
fn word_guess_rejects_missing_guesses() {
    let solution = json!({ "word": "HELLO" });
    let v = validate_submission("word-guess", &json!({}), &solution, &env(json!({})));
    assert!(!v.valid);
}

fn word_groups_solution() -> Value {
    json!({
        "categories": [
            {"name": "Fruits", "words": ["APPLE", "BANANA", "CHERRY", "DATE"], "level": 0},
            {"name": "Colors", "words": ["RED", "BLUE", "GREEN", "YELLOW"], "level": 1},
            {"name": "Animals", "words": ["DOG", "CAT", "BIRD", "FISH"], "level": 2},
            {"name": "Numbers", "words": ["ONE", "TWO", "THREE", "FOUR"], "level": 3}
        ]
    })
}

#[test]
fn word_groups_accepts_win_from_found_categories() {
    let found = json!({
        "foundCategories": [
            ["APPLE", "BANANA", "CHERRY", "DATE"],
            ["RED", "BLUE", "GREEN", "YELLOW"],
            ["DOG", "CAT", "BIRD", "FISH"],
            ["ONE", "TWO", "THREE", "FOUR"]
        ],
        "mistakes": 1
    });
    let v = validate_submission(
        "word-groups",
        &json!({}),
        &word_groups_solution(),
        &env(found),
    );
    assert!(v.valid, "{v:?}");
    assert_eq!(v.status, Some(SubmissionStatus::Won));
    assert_eq!(v.score, Some(75));
}

#[test]
fn word_groups_accepts_loss_when_not_all_found() {
    let mut envelope = env(json!({
        "foundCategories": [
            ["APPLE", "BANANA", "CHERRY", "DATE"]
        ],
        "mistakes": 4
    }));
    envelope.status = SubmissionStatus::Lost;
    let v = validate_submission(
        "word-groups",
        &json!({}),
        &word_groups_solution(),
        &envelope,
    );
    assert!(v.valid, "{v:?}");
    assert_eq!(v.status, Some(SubmissionStatus::Lost));
    assert_eq!(v.score, Some(0));
}

#[test]
fn word_groups_rejects_false_win() {
    let v = validate_submission(
        "word-groups",
        &json!({}),
        &word_groups_solution(),
        &env(json!({
            "foundCategories": [["APPLE", "BANANA", "CHERRY", "DATE"]],
            "mistakes": 0
        })),
    );
    assert!(!v.valid);
}

#[test]
fn block_slide_uses_server_min_moves() {
    let solution = json!({ "minMoves": 5 });
    let data = env(json!({ "moveCount": 5, "minMoves": 1 })); // client minMoves ignored
    let v = validate_submission("block-slide", &json!({}), &solution, &data);
    assert!(v.valid, "expected valid: {v:?}");
}

#[test]
fn tango_accepts_full_solution() {
    let solution = json!({ "grid": [["sun","moon"],["moon","sun"]] });
    let data = env(json!({ "grid": [["sun","moon"],["moon","sun"]] }));
    let v = validate_submission("tango", &json!({}), &solution, &data);
    assert!(v.valid, "expected valid: {v:?}");
}

fn lost_env(data: Value) -> SubmissionEnvelope {
    let mut envelope = env(data);
    envelope.status = SubmissionStatus::Lost;
    envelope
}

fn crossword_solution() -> Value {
    json!({ "grid": [
        ["C","A","P","E","R"],
        ["A","L","I","V","E"],
        ["P","I","P","E","R"],
        ["E","V","E","N","T"],
        ["R","E","S","T","S"]
    ] })
}

fn empty_crossword_grid() -> Value {
    json!([
        [null, null, null, null, null],
        [null, null, null, null, null],
        [null, null, null, null, null],
        [null, null, null, null, null],
        [null, null, null, null, null]
    ])
}

/// Honest give-ups must be recordable terminals for every module whose
/// domain accepts a loss claim; the adapters previously hard-coded `Won`
/// and turned every give-up into "Invalid win claim".
#[test]
fn crossword_accepts_an_honest_loss() {
    let v = validate_submission(
        "crossword",
        &json!({}),
        &crossword_solution(),
        &lost_env(json!({ "finalGrid": empty_crossword_grid() })),
    );
    assert!(v.valid, "{v:?}");
    assert_eq!(v.status, Some(SubmissionStatus::Lost));
}

#[test]
fn crossword_wrong_check_identifies_cells_without_answers() {
    let solution = crossword_solution();
    let mut wrong = solution["grid"].clone();
    wrong[0][1] = json!("Z");
    wrong[4][4] = json!("Z");
    let v = validate_submission(
        "crossword",
        &json!({}),
        &solution,
        &env(json!({"finalGrid": wrong})),
    );
    assert!(!v.valid);
    assert_eq!(
        v.error.as_deref(),
        Some("crossword_incorrect_cells:16777218")
    );
}

#[test]
fn crossword_still_rejects_a_false_win() {
    let v = validate_submission(
        "crossword",
        &json!({}),
        &crossword_solution(),
        &env(json!({ "finalGrid": empty_crossword_grid() })),
    );
    assert!(!v.valid);
}

#[test]
fn nonogram_accepts_an_honest_loss() {
    let solution = json!({ "grid": [[true, false], [false, true]] });
    let v = validate_submission(
        "nonogram",
        &json!({}),
        &solution,
        &lost_env(json!({ "finalGrid": [[false, false], [false, false]] })),
    );
    assert!(v.valid, "{v:?}");
    assert_eq!(v.status, Some(SubmissionStatus::Lost));
}

#[test]
fn word_ladder_accepts_an_honest_loss() {
    let solution = json!({ "path": ["CAT", "COT", "COG", "DOG"] });
    let v = validate_submission(
        "word-ladder",
        &json!({}),
        &solution,
        &lost_env(json!({ "path": ["CAT"] })),
    );
    assert!(v.valid, "{v:?}");
    assert_eq!(v.status, Some(SubmissionStatus::Lost));
}

#[test]
fn tango_accepts_an_honest_loss() {
    let solution = json!({ "grid": [["sun", "moon"], ["moon", "sun"]] });
    let v = validate_submission(
        "tango",
        &json!({}),
        &solution,
        &lost_env(json!({ "grid": [[null, null], [null, null]] })),
    );
    assert!(v.valid, "{v:?}");
    assert_eq!(v.status, Some(SubmissionStatus::Lost));
}

#[test]
fn word_search_accepts_an_honest_loss() {
    let solution = json!({ "words": ["CAT", "DOG"] });
    let v = validate_submission(
        "word-search",
        &json!({}),
        &solution,
        &lost_env(json!({ "foundWords": ["CAT"] })),
    );
    assert!(v.valid, "{v:?}");
    assert_eq!(v.status, Some(SubmissionStatus::Lost));
}

#[test]
fn quad_words_replay_refuses_a_nonword_even_when_all_targets_are_solved() {
    let solution = json!({ "words": ["NAVAL", "ROCKY", "PUNCH", "LAUGH"] });
    let history = env(json!({"guessHistory": ["ZZZZZ", "NAVAL", "ROCKY", "PUNCH", "LAUGH"]}));
    let v = validate_submission("quad-words", &json!({}), &solution, &history);
    assert_eq!(v.error.as_deref(), Some("Not in word list"));
    let legal = env(json!({"guessHistory": ["AAHED", "NAVAL", "ROCKY", "PUNCH", "LAUGH"]}));
    assert!(validate_submission("quad-words", &json!({}), &solution, &legal).valid);
}

#[test]
fn quad_words_rejects_false_solved_claim() {
    let solution = json!({ "words": ["NAVAL", "ROCKY", "PUNCH", "LAUGH"] });
    // guesses that never solve any board; client claims 4 solved
    let data = env(
        json!({ "guessHistory": ["CRANE", "STALE"], "solvedBoards": [true, true, true, true] }),
    );
    let v = validate_submission("quad-words", &json!({}), &solution, &data);
    assert!(!v.valid);
}

#[test]
fn arithmo_accepts_an_honest_loss() {
    let solution = json!({ "equation": "12+34=46" });
    let v = validate_submission(
        "arithmo",
        &json!({}),
        &solution,
        &lost_env(json!({ "guesses": ["56-32=24"] })),
    );
    assert!(v.valid, "{v:?}");
    assert_eq!(v.status, Some(SubmissionStatus::Lost));
}

#[test]
fn arithmo_still_rejects_a_false_win() {
    let solution = json!({ "equation": "12+34=46" });
    let v = validate_submission(
        "arithmo",
        &json!({}),
        &solution,
        &env(json!({ "guesses": ["56-32=24"] })),
    );
    assert!(!v.valid);
}

#[test]
fn block_slide_accepts_an_honest_loss() {
    let solution = json!({ "minMoves": 10 });
    let v = validate_submission(
        "block-slide",
        &json!({}),
        &solution,
        &lost_env(json!({ "moveCount": 4 })),
    );
    assert!(v.valid, "{v:?}");
    assert_eq!(v.status, Some(SubmissionStatus::Lost));
}

#[test]
fn word_box_accepts_the_generator_letter_array() {
    let solution = json!({ "allLetters": ["A","B","C","D","E","F","G","H","I","J","K","L"] });
    let string_shape = json!({ "allLetters": "ABCDEFGHIJKL" });
    let env = SubmissionEnvelope {
        status: SubmissionStatus::Won,
        attempts: 1,
        time_spent_ms: 1,
        data: json!({ "words": ["ABCD"] }),
    };
    // Both shapes read the same letters, so both give the same verdict.
    assert_eq!(
        validate_submission("word-box", &json!({}), &solution, &env),
        validate_submission("word-box", &json!({}), &string_shape, &env)
    );
    assert_ne!(
        validate_submission("word-box", &json!({}), &solution, &env)
            .error
            .as_deref(),
        Some("Missing allLetters solution")
    );
}

#[test]
fn word_box_accepts_an_honest_loss() {
    let solution = json!({ "allLetters": "ABCDEFGHIJKL" });
    let v = validate_submission(
        "word-box",
        &json!({}),
        &solution,
        &lost_env(json!({ "words": [] })),
    );
    assert!(v.valid, "{v:?}");
    assert_eq!(v.status, Some(SubmissionStatus::Lost));
}

#[test]
fn quad_words_accepts_an_honest_loss() {
    let solution = json!({ "words": ["NAVAL", "ROCKY", "PUNCH", "LAUGH"] });
    let v = validate_submission(
        "quad-words",
        &json!({}),
        &solution,
        &lost_env(
            json!({ "guessHistory": ["CRANE"], "solvedBoards": [false, false, false, false] }),
        ),
    );
    assert!(v.valid, "{v:?}");
    assert_eq!(v.status, Some(SubmissionStatus::Lost));
    assert_eq!(v.score, Some(0));
}

#[test]
fn killer_sudoku_accepts_an_honest_loss() {
    let solution = json!({ "grid": [[1]] });
    let v = validate_submission(
        "killer-sudoku",
        &json!({}),
        &solution,
        &lost_env(json!({ "finalGrid": [[2]], "mistakes": 0 })),
    );
    assert!(v.valid, "{v:?}");
    assert_eq!(v.status, Some(SubmissionStatus::Lost));
}

#[test]
fn cryptogram_accepts_an_honest_loss() {
    let solution = json!({ "reverseCipher": { "X": "A", "Y": "B" } });
    let v = validate_submission(
        "cryptogram",
        &json!({}),
        &solution,
        &lost_env(json!({ "guesses": { "X": "A" }, "hintsUsed": 1 })),
    );
    assert!(v.valid, "{v:?}");
    assert_eq!(v.status, Some(SubmissionStatus::Lost));
}

fn cryptogram_partial_alphabet() -> (Value, Value) {
    // Solution maps all 26 letters; the puzzle only uses A, B and C.
    let cipher: serde_json::Map<String, Value> = ('A'..='Z')
        .map(|c| {
            let plain = char::from(b'Z' - (c as u8 - b'A'));
            (c.to_string(), Value::String(plain.to_string()))
        })
        .collect();
    (
        json!({ "encryptedText": "ABC CBA!" }),
        json!({ "reverseCipher": cipher }),
    )
}

#[test]
fn cryptogram_accepts_a_win_decoding_only_the_letters_in_the_puzzle() {
    let (puzzle, solution) = cryptogram_partial_alphabet();
    let v = validate_submission(
        "cryptogram",
        &puzzle,
        &solution,
        &env(json!({ "guesses": { "A": "Z", "B": "Y", "C": "X" }, "hintsUsed": 0 })),
    );
    assert!(v.valid, "{v:?}");
    assert_eq!(v.status, Some(SubmissionStatus::Won));
}

#[test]
fn cryptogram_rejects_a_win_with_a_wrong_or_missing_present_letter() {
    let (puzzle, solution) = cryptogram_partial_alphabet();
    for guesses in [
        json!({ "A": "Z", "B": "Y", "C": "Q" }),
        json!({ "A": "Z", "B": "Y" }),
    ] {
        let v = validate_submission(
            "cryptogram",
            &puzzle,
            &solution,
            &env(json!({ "guesses": guesses, "hintsUsed": 0 })),
        );
        assert!(!v.valid, "{v:?}");
    }
}

#[test]
fn cryptogram_without_puzzle_text_requires_every_solution_letter() {
    let (_, solution) = cryptogram_partial_alphabet();
    // No encryptedText: fall back to all 26 keys, so a 3-letter decode is not a win.
    let v = validate_submission(
        "cryptogram",
        &json!({}),
        &solution,
        &env(json!({ "guesses": { "A": "Z", "B": "Y", "C": "X" }, "hintsUsed": 0 })),
    );
    assert!(!v.valid, "{v:?}");
}

#[test]
fn cryptogram_reads_puzzle_text_nested_under_puzzle_data() {
    let (puzzle, solution) = cryptogram_partial_alphabet();
    let nested = json!({ "puzzleData": puzzle });
    let v = validate_submission(
        "cryptogram",
        &nested,
        &solution,
        &env(json!({ "guesses": { "A": "Z", "B": "Y", "C": "X" }, "hintsUsed": 0 })),
    );
    assert!(v.valid, "{v:?}");
    assert_eq!(v.status, Some(SubmissionStatus::Won));
}

#[test]
fn pattern_match_accepts_an_honest_loss() {
    let solution = json!({ "validSets": [[0, 1, 2]], "totalSets": 1 });
    let v = validate_submission(
        "pattern-match",
        &json!({}),
        &solution,
        &lost_env(json!({ "foundSets": [], "mistakes": 3 })),
    );
    assert!(v.valid, "{v:?}");
    assert_eq!(v.status, Some(SubmissionStatus::Lost));
    assert_eq!(v.score, Some(0));
}

#[test]
fn pattern_match_rejects_a_loss_claim_with_all_sets() {
    let solution = json!({ "validSets": [[0, 1, 2]], "totalSets": 1 });
    let v = validate_submission(
        "pattern-match",
        &json!({}),
        &solution,
        &lost_env(json!({ "foundSets": [[0, 1, 2]], "mistakes": 0 })),
    );
    assert!(!v.valid, "{v:?}");
}

#[test]
fn pattern_match_still_rejects_a_false_win() {
    let solution = json!({ "validSets": [[0, 1, 2]], "totalSets": 1 });
    let v = validate_submission(
        "pattern-match",
        &json!({}),
        &solution,
        &env(json!({ "foundSets": [], "mistakes": 0 })),
    );
    assert!(!v.valid, "{v:?}");
}

fn number_path_clues() -> Value {
    json!({
        "size": 3,
        "clues": [
            [1, null, null],
            [null, null, null],
            [null, null, 9]
        ]
    })
}

fn number_path_path_a() -> Value {
    json!({
        "path": [
            {"row": 0, "col": 0},
            {"row": 0, "col": 1},
            {"row": 0, "col": 2},
            {"row": 1, "col": 2},
            {"row": 1, "col": 1},
            {"row": 1, "col": 0},
            {"row": 2, "col": 0},
            {"row": 2, "col": 1},
            {"row": 2, "col": 2}
        ]
    })
}

fn number_path_path_b() -> Value {
    json!({
        "path": [
            {"row": 0, "col": 0},
            {"row": 1, "col": 0},
            {"row": 2, "col": 0},
            {"row": 2, "col": 1},
            {"row": 1, "col": 1},
            {"row": 0, "col": 1},
            {"row": 0, "col": 2},
            {"row": 1, "col": 2},
            {"row": 2, "col": 2}
        ]
    })
}

fn number_path_incomplete() -> Value {
    json!({
        "path": [
            {"row": 0, "col": 0},
            {"row": 0, "col": 1},
            {"row": 0, "col": 2},
            {"row": 1, "col": 2}
        ]
    })
}

#[test]
fn number_path_has_server_validator() {
    assert!(has_server_validator("number-path"));
}

#[test]
fn number_path_accepts_alternate_hamiltonian_path() {
    let v = validate_submission(
        "number-path",
        &number_path_clues(),
        &number_path_path_a(),
        &env(number_path_path_b()),
    );
    assert!(v.valid, "{v:?}");
    assert_eq!(v.status, Some(SubmissionStatus::Won));
    assert_eq!(v.score, Some(500));
}

#[test]
fn number_path_rejects_false_win() {
    let v = validate_submission(
        "number-path",
        &number_path_clues(),
        &number_path_path_a(),
        &env(number_path_incomplete()),
    );
    assert!(!v.valid);
    assert!(v
        .error
        .as_deref()
        .is_some_and(|e| e.contains("not correctly solved")));
}

#[test]
fn number_path_missing_path_is_not_unsupported_slug() {
    let v = validate_submission(
        "number-path",
        &number_path_clues(),
        &json!({}),
        &env(json!({})),
    );
    assert!(!v.valid);
    assert_eq!(v.error.as_deref(), Some("Missing path"));
    assert!(v
        .error
        .as_deref()
        .is_none_or(|e| !e.starts_with("unsupported game slug:")));
}

#[test]
fn number_path_incomplete_claimed_lost_is_valid_zero() {
    let mut envelope = env(number_path_incomplete());
    envelope.status = SubmissionStatus::Lost;
    let v = validate_submission(
        "number-path",
        &number_path_clues(),
        &number_path_path_a(),
        &envelope,
    );
    assert!(v.valid, "{v:?}");
    assert_eq!(v.status, Some(SubmissionStatus::Lost));
    assert_eq!(v.score, Some(0));
}

fn pip_place_puzzle() -> Value {
    json!({
        "maxPip": 1,
        "rows": 2,
        "cols": 3,
        "regionOf": [
            [1, 1, 0],
            [1, 1, 1]
        ],
        "regions": [
            {"id": 0, "kind": "sum", "value": 0},
            {"id": 1, "kind": "free", "value": null}
        ]
    })
}

fn pip_place_tiles_a() -> Value {
    json!({
        "tiles": [
            {"a": {"row": 0, "col": 0}, "b": {"row": 1, "col": 0}, "pa": 0, "pb": 0},
            {"a": {"row": 0, "col": 1}, "b": {"row": 1, "col": 1}, "pa": 1, "pb": 1},
            {"a": {"row": 0, "col": 2}, "b": {"row": 1, "col": 2}, "pa": 0, "pb": 1}
        ]
    })
}

fn pip_place_tiles_b() -> Value {
    json!({
        "tiles": [
            {"a": {"row": 0, "col": 0}, "b": {"row": 0, "col": 1}, "pa": 0, "pb": 0},
            {"a": {"row": 1, "col": 0}, "b": {"row": 1, "col": 1}, "pa": 1, "pb": 1},
            {"a": {"row": 0, "col": 2}, "b": {"row": 1, "col": 2}, "pa": 0, "pb": 1}
        ]
    })
}

fn pip_place_incomplete() -> Value {
    json!({
        "tiles": [
            {"a": {"row": 0, "col": 0}, "b": {"row": 1, "col": 0}, "pa": 0, "pb": 0},
            {"a": {"row": 0, "col": 1}, "b": {"row": 1, "col": 1}, "pa": 1, "pb": 1}
        ]
    })
}

#[test]
fn pip_place_has_server_validator() {
    assert!(has_server_validator("pip-place"));
}

#[test]
fn pip_place_accepts_alternate_tiling() {
    let v = validate_submission(
        "pip-place",
        &pip_place_puzzle(),
        &pip_place_tiles_a(),
        &env(pip_place_tiles_b()),
    );
    assert!(v.valid, "{v:?}");
    assert_eq!(v.status, Some(SubmissionStatus::Won));
    assert_eq!(v.score, Some(500));
}

#[test]
fn pip_place_rejects_false_win() {
    let v = validate_submission(
        "pip-place",
        &pip_place_puzzle(),
        &pip_place_tiles_a(),
        &env(pip_place_incomplete()),
    );
    assert!(!v.valid);
    assert!(v
        .error
        .as_deref()
        .is_some_and(|e| e.contains("not correctly solved")));
}

#[test]
fn pip_place_missing_tiles_is_not_unsupported_slug() {
    let v = validate_submission(
        "pip-place",
        &pip_place_puzzle(),
        &json!({}),
        &env(json!({})),
    );
    assert!(!v.valid);
    assert_eq!(v.error.as_deref(), Some("Missing tiles"));
    assert!(v
        .error
        .as_deref()
        .is_none_or(|e| !e.starts_with("unsupported game slug:")));
}

#[test]
fn pip_place_incomplete_claimed_lost_is_valid_zero() {
    let mut envelope = env(pip_place_incomplete());
    envelope.status = SubmissionStatus::Lost;
    let v = validate_submission(
        "pip-place",
        &pip_place_puzzle(),
        &pip_place_tiles_a(),
        &envelope,
    );
    assert!(v.valid, "{v:?}");
    assert_eq!(v.status, Some(SubmissionStatus::Lost));
    assert_eq!(v.score, Some(0));
}

#[test]
fn crowns_incomplete_claimed_lost_is_valid_zero() {
    let puzzle = json!({
        "size": 4,
        "regions": [
            [0, 0, 1, 1],
            [0, 0, 1, 1],
            [2, 2, 3, 3],
            [2, 2, 3, 3]
        ]
    });
    let empty = json!({
        "finalGrid": [
            [false, false, false, false],
            [false, false, false, false],
            [false, false, false, false],
            [false, false, false, false]
        ]
    });
    let mut envelope = env(empty);
    envelope.status = SubmissionStatus::Lost;
    let v = validate_submission("crowns", &puzzle, &json!({ "queens": [] }), &envelope);
    assert!(v.valid, "{v:?}");
    assert_eq!(v.status, Some(SubmissionStatus::Lost));
    assert_eq!(v.score, Some(0));
}

#[test]
fn unknown_game_fails_closed() {
    let v = validate_submission("no-such-game", &json!({}), &json!({}), &env(json!({})));
    assert!(!v.valid);
    assert!(!has_server_validator("no-such-game"));
    assert!(!has_server_validator("brand-new-module"));
}

#[test]
fn every_catalog_slug_has_a_server_validator() {
    use crate::capabilities::puzzle_play::domain::game_slugs::all_game_slugs;
    for slug in all_game_slugs() {
        assert!(
            has_server_validator(slug),
            "{slug} is customer-catalogued without a server validator"
        );
        let v = validate_submission(slug, &json!({}), &json!({}), &env(json!({})));
        assert!(
            v.error
                .as_deref()
                .is_none_or(|e| !e.starts_with("unsupported game slug:")),
            "{slug} dispatch must not be unsupported: {v:?}"
        );
    }
    assert!(has_server_validator("queens"));
    assert!(has_server_validator("tango"));
}
