use std::collections::HashSet;

use serde_json::Value;

use super::super::word_groups::MAX_MISTAKES;
use super::{generate_word_groups_puzzle, BANK};

#[test]
fn seed_is_deterministic() {
    let (a, sa) = generate_word_groups_puzzle(956);
    let (b, sb) = generate_word_groups_puzzle(956);
    assert_eq!(a, b);
    assert_eq!(sa, sb);
}

#[test]
fn client_payload_is_sixteen_words_without_groupings() {
    let (pd, sol) = generate_word_groups_puzzle(1);
    let words = pd.get("words").and_then(|v| v.as_array()).expect("words");
    assert_eq!(words.len(), 16);
    assert!(pd.get("categories").is_none());
    assert!(pd.get("solution").is_none());
    assert_eq!(pd["maxMistakes"], MAX_MISTAKES);
    let cats = sol
        .get("categories")
        .and_then(|v| v.as_array())
        .expect("cats");
    assert_eq!(cats.len(), 4);
    let mut from_sol = Vec::new();
    for cat in cats {
        let ws = cat.get("words").and_then(|v| v.as_array()).expect("w");
        assert_eq!(ws.len(), 4);
        from_sol.extend(ws.iter().filter_map(Value::as_str).map(str::to_string));
    }
    let mut from_pd: Vec<String> = words
        .iter()
        .filter_map(Value::as_str)
        .map(str::to_string)
        .collect();
    from_pd.sort();
    from_sol.sort();
    assert_eq!(from_pd, from_sol);
}

#[test]
fn bank_contains_forty_well_formed_puzzles() {
    assert_eq!(BANK.len(), 40);
    for (puzzle_index, puzzle) in BANK.iter().enumerate() {
        let (_, solution) = generate_word_groups_puzzle(puzzle_index as i64);
        let categories = solution["categories"].as_array().expect("categories");
        assert_eq!(categories.len(), 4, "puzzle {puzzle_index}");
        let mut words = HashSet::new();
        for (level, (name, tiles)) in puzzle.iter().enumerate() {
            assert!(!name.trim().is_empty(), "puzzle {puzzle_index}");
            assert_eq!(tiles.len(), 4, "category {name}");
            assert_eq!(categories[level]["level"], level, "category {name}");
            for word in tiles {
                assert!(!word.trim().is_empty(), "category {name}");
                assert!(
                    words.insert(word),
                    "puzzle {puzzle_index}: duplicate word {word}"
                );
            }
        }
        assert_eq!(words.len(), 16, "puzzle {puzzle_index}");
    }
}
