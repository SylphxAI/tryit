use serde_json::{json, Value};

use super::{generate_queens_puzzle, generate_queens_puzzle_with_size};
use crate::capabilities::puzzle_play::crossword_generate::client_safe_puzzle_data;
use crate::capabilities::puzzle_play::queens_conflict::is_solved;

fn queens_to_grid(queens: &[(usize, usize)], size: usize) -> Vec<Vec<bool>> {
    let mut grid = vec![vec![false; size]; size];
    for &(row, col) in queens {
        if row < size && col < size {
            grid[row][col] = true;
        }
    }
    grid
}

fn parse_queens(sol: &Value) -> Vec<(usize, usize)> {
    sol.get("queens")
        .and_then(Value::as_array)
        .map(|items| {
            items
                .iter()
                .filter_map(|pair| {
                    let cells = pair.as_array()?;
                    Some((
                        cells.first()?.as_u64()? as usize,
                        cells.get(1)?.as_u64()? as usize,
                    ))
                })
                .collect()
        })
        .unwrap_or_default()
}

fn parse_regions(pd: &Value) -> Vec<Vec<i32>> {
    pd.get("regions")
        .and_then(Value::as_array)
        .map(|rows| {
            rows.iter()
                .map(|row| {
                    row.as_array()
                        .map(|cells| {
                            cells
                                .iter()
                                .filter_map(Value::as_i64)
                                .map(|v| v as i32)
                                .collect()
                        })
                        .unwrap_or_default()
                })
                .collect()
        })
        .unwrap_or_default()
}

#[test]
fn seed_is_deterministic() {
    let (a, sa) = generate_queens_puzzle(5);
    let (b, sb) = generate_queens_puzzle(5);
    assert_eq!(a, b);
    assert_eq!(sa, sb);
}

#[test]
fn matches_typescript_seed_five_size_six() {
    let (pd, sol) = generate_queens_puzzle(5);
    assert_eq!(pd["size"], 6);
    let regions = parse_regions(&pd);
    let expected = vec![
        vec![1, 1, 1, 0, 2, 2],
        vec![1, 1, 2, 2, 2, 2],
        vec![4, 4, 2, 2, 2, 2],
        vec![4, 4, 3, 2, 2, 2],
        vec![4, 4, 2, 2, 2, 2],
        vec![4, 4, 2, 2, 2, 5],
    ];
    assert_eq!(regions, expected);
    assert_eq!(
        parse_queens(&sol),
        vec![(0, 3), (1, 1), (2, 4), (3, 2), (4, 0), (5, 5)]
    );
    // Retry walk converges: TS seeds 4 and 6 yield the same unique board.
    assert_eq!(generate_queens_puzzle(4), (pd.clone(), sol.clone()));
    assert_eq!(generate_queens_puzzle(6), (pd, sol));
}

#[test]
fn matches_typescript_seed_zero_size_five() {
    let (pd, sol) = generate_queens_puzzle_with_size(0, 5);
    assert_eq!(pd["size"], 5);
    assert_eq!(
        parse_regions(&pd),
        vec![
            vec![1, 1, 1, 0, 0],
            vec![1, 1, 1, 1, 2],
            vec![1, 1, 1, 1, 2],
            vec![4, 1, 3, 1, 1],
            vec![4, 4, 4, 4, 4],
        ]
    );
    assert_eq!(
        parse_queens(&sol),
        vec![(0, 3), (1, 1), (2, 4), (3, 2), (4, 0)]
    );
}

#[test]
fn matches_typescript_seed_956_size_six() {
    let (pd, sol) = generate_queens_puzzle(956);
    assert_eq!(
        parse_regions(&pd),
        vec![
            vec![0, 0, 0, 0, 0, 0],
            vec![0, 0, 0, 0, 0, 1],
            vec![0, 2, 3, 0, 5, 1],
            vec![3, 3, 3, 3, 5, 5],
            vec![4, 4, 5, 5, 5, 5],
            vec![5, 5, 5, 5, 5, 5],
        ]
    );
    assert_eq!(
        parse_queens(&sol),
        vec![(0, 2), (1, 5), (2, 1), (3, 3), (4, 0), (5, 4)]
    );
}

#[test]
fn client_payload_has_no_queen_coordinates() {
    let (pd, sol) = generate_queens_puzzle(5);
    assert!(pd.get("queens").is_none());
    assert!(pd.get("solution").is_none());
    let dumped = pd.to_string();
    assert!(
        !dumped.contains("\"queens\""),
        "GetDaily payload must not leak queens: {dumped}"
    );
    assert_eq!(parse_queens(&sol).len(), 6);
}

#[test]
fn unique_solution_is_solved() {
    let (pd, sol) = generate_queens_puzzle(5);
    let size = pd["size"].as_u64().unwrap_or(0) as usize;
    let regions = parse_regions(&pd);
    let queens = parse_queens(&sol);
    let grid = queens_to_grid(&queens, size);
    assert!(is_solved(&grid, &regions, size));
}

#[test]
fn unlucky_seeds_still_densify() {
    // TypeScript throws for 6×6 seeds 0–3 after 10 attempts. Free floor
    // must still serve a unique puzzle. 42/249/980 are also TS-throwers
    // at nearby daily puzzle numbers.
    let seeds: Vec<i64> = (0_i64..=30).chain([42, 249, 980]).collect();
    for seed in seeds {
        let (pd, sol) = generate_queens_puzzle(seed);
        let size = pd["size"].as_u64().unwrap_or(0) as usize;
        assert_eq!(size, 6, "seed {seed}");
        let regions = parse_regions(&pd);
        let queens = parse_queens(&sol);
        assert_eq!(queens.len(), size, "seed {seed}");
        let grid = queens_to_grid(&queens, size);
        assert!(is_solved(&grid, &regions, size), "seed {seed} not solved");
    }
}

#[test]
fn client_safe_strips_leaked_queens() {
    let leaked = json!({
        "size": 6,
        "regions": [[0]],
        "queens": [[0, 1]],
    });
    let safe = client_safe_puzzle_data(leaked);
    assert_eq!(safe.get("queens"), None);
    assert_eq!(safe["size"], 6);
}
