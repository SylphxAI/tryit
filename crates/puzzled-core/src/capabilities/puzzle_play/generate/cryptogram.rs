//! Cipher pairs a sourced public-domain excerpt with the alphabet shuffled
//! by the frozen LCG. Stored puzzles retain their original wire shape.

use std::collections::{BTreeMap, BTreeSet};

use serde_json::{json, Value};

use crate::puzzle_play::random::{seeded_random, shuffle_array};

const MAX_HINTS: u32 = 3;
const ALPHABET: &str = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";

// Fields: excerpt, author, work/edition, publication year, category, Gutenberg ID.
const QUOTES: &str = include_str!("data/cryptogram_quotes.tsv");
const QUOTE_COUNT: usize = 50;

fn quote(row: &str) -> Option<(&str, &str, &str)> {
    let [text, author, _, year, category, _]: [&str; 6] =
        row.split('\t').collect::<Vec<_>>().try_into().ok()?;
    (year.parse::<u16>().ok()? < 1929).then_some((text, author, category))
}

/// `(puzzle_data, solution)` for a seed, or why none could be made.
pub fn generate(seed: i64, _difficulty: Option<&str>) -> Result<(Value, Value), String> {
    let index = (seed.unsigned_abs() % QUOTE_COUNT as u64) as usize;
    let (text, author, category) = QUOTES
        .lines()
        .nth(index)
        .and_then(quote)
        .ok_or_else(|| "cryptogram: invalid quote record".to_string())?;

    let letters: Vec<char> = ALPHABET.chars().collect();
    let shuffled = shuffle_array(&letters, &mut seeded_random(seed));
    let cipher: BTreeMap<char, char> = letters.iter().copied().zip(shuffled).collect();
    let reverse: BTreeMap<char, char> = cipher.iter().map(|(k, v)| (*v, *k)).collect();

    let upper = text.to_ascii_uppercase();
    let encrypted: String = upper
        .chars()
        .map(|c| {
            if c.is_ascii_uppercase() {
                cipher.get(&c).copied().unwrap_or(c)
            } else {
                c
            }
        })
        .collect();
    let unique: BTreeSet<char> = encrypted.chars().filter(char::is_ascii_uppercase).collect();

    let to_json = |map: &BTreeMap<char, char>| -> Value {
        Value::Object(
            map.iter()
                .map(|(k, v)| (k.to_string(), Value::String(v.to_string())))
                .collect(),
        )
    };
    Ok((
        json!({
            "encryptedText": encrypted,
            "author": author,
            "category": category,
            "uniqueLetters": unique.len(),
            "maxHints": MAX_HINTS,
        }),
        json!({
            "originalText": upper,
            "cipher": to_json(&cipher),
            "reverseCipher": to_json(&reverse),
        }),
    ))
}

/// The solution rewritten as the submission the validator grades, for the
/// generator self-check: every encrypted letter guessed right, no hints.
#[must_use]
pub fn solution_submission(solution: &Value) -> Value {
    json!({
        "guesses": solution.get("reverseCipher").cloned().unwrap_or_else(|| json!({})),
        "hintsUsed": 0,
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn verified_editions_and_playable_cipher_for_every_quote() {
        // Checked against the transcriptions of these eight editions, not just
        // an author/date written next to a new quote.
        let editions = [
            ("98", "Charles Dickens", "A Tale of Two Cities", "1859"),
            ("174", "Oscar Wilde", "The Picture of Dorian Gray", "1891"),
            ("205", "Henry David Thoreau", "Walden", "1854"),
            ("514", "Louisa May Alcott", "Little Women", "1869"),
            (
                "844",
                "Oscar Wilde",
                "The Importance of Being Earnest",
                "1899",
            ),
            ("1342", "Jane Austen", "Pride and Prejudice", "1813"),
            ("1524", "William Shakespeare", "Hamlet", "1604"),
            (
                "59",
                "Rene Descartes",
                "Discourse on the Method, John Veitch translation",
                "1850",
            ),
        ];
        assert_eq!(QUOTES.lines().count(), QUOTE_COUNT);
        let mut texts = BTreeSet::new();
        for (index, row) in QUOTES.lines().enumerate() {
            let fields: Vec<_> = row.split('\t').collect();
            let (text, author, category) = quote(row).expect("dated quote");
            assert!(editions.contains(&(fields[5], author, fields[2], fields[3])));
            assert!(texts.insert(text.to_ascii_uppercase()));
            assert!((20..=150).contains(&text.len()));
            assert!(text
                .bytes()
                .all(|b| b.is_ascii_alphabetic() || b" ,.;:!?'-".contains(&b)));
            let seed = index as i64;
            let (data, sol) = generate(seed, None).expect("playable quote");
            assert_eq!(generate(seed, None).unwrap(), (data.clone(), sol.clone()));
            assert_eq!(data["author"], author);
            assert_eq!(data["category"], category);
            assert!(data["uniqueLetters"].as_u64().unwrap() > u64::from(MAX_HINTS));
            let decoded: String = data["encryptedText"]
                .as_str()
                .unwrap()
                .chars()
                .map(|ch| {
                    sol["reverseCipher"][ch.to_string()]
                        .as_str()
                        .map_or(ch, |s| s.chars().next().unwrap())
                })
                .collect();
            assert_eq!(decoded, text.to_ascii_uppercase());
            assert!(data.get("originalText").is_none());
        }
    }
}
