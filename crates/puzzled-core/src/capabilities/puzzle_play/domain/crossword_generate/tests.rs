use serde_json::json;

use super::{client_safe_puzzle_data, generate_crossword_puzzle, word_square_count};

fn fnv1a(text: &str) -> u64 {
    text.bytes().fold(0xcbf2_9ce4_8422_2325_u64, |h, b| {
        (h ^ u64::from(b)).wrapping_mul(0x0100_0000_01b3)
    })
}

#[test]
fn seed_is_deterministic() {
    let (a, sa) = generate_crossword_puzzle(956);
    let (b, sb) = generate_crossword_puzzle(956);
    assert_eq!(a, b);
    assert_eq!(sa, sb);
}

#[test]
fn solution_is_5x5_letters() {
    let (_pd, sol) = generate_crossword_puzzle(1);
    let grid = sol.get("grid").and_then(|g| g.as_array()).expect("grid");
    assert_eq!(grid.len(), 5);
    for row in grid {
        let cells = row.as_array().expect("row");
        assert_eq!(cells.len(), 5);
        for c in cells {
            let s = c.as_str().expect("letter");
            assert_eq!(s.len(), 1);
            assert!(s.chars().next().unwrap().is_ascii_uppercase());
        }
    }
}

#[test]
fn pool_nonempty() {
    assert!(word_square_count() >= 30);
}

#[test]
fn puzzle_data_does_not_include_clue_answers() {
    let (pd, sol) = generate_crossword_puzzle(956);
    let dumped = pd.to_string();
    assert!(
        !dumped.contains("\"answer\""),
        "GetDaily payload must not leak answers: {dumped}"
    );
    assert!(
        !dumped.to_ascii_lowercase().contains("steam"),
        "solution letters must not appear in client puzzle_data: {dumped}"
    );
    let grid = sol
        .get("grid")
        .and_then(|g| g.as_array())
        .expect("sol grid");
    assert_eq!(grid[0][0], "S");
}

#[test]
fn client_safe_strips_stored_clue_answers() {
    let leaked = json!({
        "grid": [["", ""]],
        "clues": {
            "across": [{"number": 1, "clue": "Hot mist", "answer": "STEAM", "row": 0, "col": 0, "length": 5}],
            "down": [{"number": 1, "clue": "Water vapor", "answer": "STEAM"}]
        },
        "solution": {"grid": [["S"]]}
    });
    let safe = client_safe_puzzle_data(leaked);
    let dumped = safe.to_string();
    assert!(!dumped.contains("\"answer\""));
    assert!(!dumped.contains("solution"));
    assert_eq!(safe["clues"]["across"][0]["clue"], "Hot mist");
    assert_eq!(safe["clues"]["across"][0].get("answer"), None);
}

/// Fingerprints of the V1 generator taken before V2 existed (dates
/// 2026-09-27 (legacy puzzle-number seed 1001), 09-28, 10-02, 10-16 (new seed;
/// its legacy puzzle-number seed is 1020), and three
/// plain seeds). Stored V1 rows are never replaced, so V1 must reproduce
/// these forever, including for dates issued in the future.
const V1_GOLDEN: [(i64, u64); 8] = [
    (1020, 0xc770_3375_7b6a_fff2),
    (1001, 0x465a_e8e5_e3f7_959c),
    (20_260_928, 0x9e32_b41c_84db_5613),
    (20_261_002, 0x643e_9593_9dde_aba4),
    (20_261_016, 0xc4f0_9eb8_305c_cd58),
    (0, 0xc770_3375_7b6a_fff2),
    (956, 0x2b75_7b80_a0f2_0d7e),
    (-7, 0xb4d9_4345_1a22_0103),
];

#[test]
fn v1_output_is_frozen() {
    for (seed, expected) in V1_GOLDEN {
        let (pd, sol) = generate_crossword_puzzle(seed);
        assert_eq!(
            fnv1a(&format!("{pd}|{sol}")),
            expected,
            "V1 crossword output changed for seed {seed}"
        );
        assert!(pd.get("clueSet").is_none(), "V1 carries no clueSet marker");
    }
}
