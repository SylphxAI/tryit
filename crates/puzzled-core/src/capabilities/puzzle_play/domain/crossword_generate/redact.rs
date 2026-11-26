use serde_json::Value;

/// Keys that must never appear on GetDaily/GetPuzzle `puzzle_data_json`.
const CLIENT_LEAK_KEYS: &[&str] = &[
    "answer",
    "solution",
    "solution_json",
    "solutionJson",
    "word",
    "queens",
];

/// Strip solution fields from a stored or generated client payload.
///
/// Covers deterministic crossword clues and any content-store row that still
/// embeds answers. Recursive so nested `clues.across[].answer` is removed.
#[must_use]
pub fn client_safe_puzzle_data(data: Value) -> Value {
    match data {
        Value::Object(map) => {
            let mut out = serde_json::Map::with_capacity(map.len());
            for (k, v) in map {
                if CLIENT_LEAK_KEYS.contains(&k.as_str()) {
                    continue;
                }
                out.insert(k, client_safe_puzzle_data(v));
            }
            Value::Object(out)
        }
        Value::Array(items) => {
            Value::Array(items.into_iter().map(client_safe_puzzle_data).collect())
        }
        other => other,
    }
}
