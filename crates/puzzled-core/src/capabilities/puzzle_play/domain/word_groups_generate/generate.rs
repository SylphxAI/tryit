use serde_json::{json, Value};

use super::super::random_lcg::{shuffle_array, SeededRandom};
use super::super::word_groups::{MAX_MISTAKES, TOTAL_CATEGORIES, WORDS_PER_CATEGORY};
use super::BANK;

/// Deterministic daily word-groups: (client-safe puzzle_data, solution).
#[must_use]
pub fn generate_word_groups_puzzle(seed: i64) -> (Value, Value) {
    let idx = seed.unsigned_abs() as usize % BANK.len();
    let puzzle = &BANK[idx];
    let mut words = Vec::with_capacity(TOTAL_CATEGORIES * WORDS_PER_CATEGORY);
    let mut categories = Vec::with_capacity(TOTAL_CATEGORIES);
    for ((name, tiles), level) in puzzle.iter().zip(0u8..) {
        words.extend(tiles.iter().copied().map(str::to_string));
        categories.push(json!({
            "name": name,
            "words": tiles,
            "level": level,
        }));
    }
    let rng_seed = u32::try_from(seed.unsigned_abs()).unwrap_or(u32::MAX);
    let mut rng = SeededRandom::new(rng_seed);
    let shuffled = shuffle_array(&words, &mut rng);
    let puzzle_data = json!({
        "words": shuffled,
        "maxMistakes": MAX_MISTAKES,
        "wordsPerCategory": WORDS_PER_CATEGORY,
        "totalCategories": TOTAL_CATEGORIES,
    });
    (puzzle_data, json!({ "categories": categories }))
}
