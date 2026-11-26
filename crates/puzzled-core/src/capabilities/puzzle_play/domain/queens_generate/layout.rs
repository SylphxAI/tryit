#![allow(clippy::needless_range_loop)]

use super::super::random::{shuffle_array, SeededRandom};
use super::solver::has_unique_solution;

/// Inner uniqueness walk matches TypeScript `maxAttempts = 10` for working
/// seeds; extra room so unlucky puzzle-numbers still densify.
/// Derived-seed retries (`seed + attempt + 1`, the TS sequence). TS stops at
/// 10 and throws; 8x8 boards need up to a few hundred, so the bound is generous.
pub(super) const MAX_UNIQUENESS_ATTEMPTS: u32 = 100_000;

fn lcg(seed: i64) -> SeededRandom {
    // Same constructor as frozen TS `seededRandom(seed)` (IEEE-754 LCG).
    SeededRandom::new(seed)
}

fn can_place_queen(queens: &[(usize, usize)], row: usize, col: usize) -> bool {
    for &(r, c) in queens {
        if c == col {
            return false;
        }
        if r.abs_diff(row) <= 1 && c.abs_diff(col) <= 1 {
            return false;
        }
    }
    true
}

fn generate_queen_positions(size: usize, rng: &mut SeededRandom) -> Vec<(usize, usize)> {
    let mut queens: Vec<(usize, usize)> = Vec::with_capacity(size);

    fn solve(size: usize, rng: &mut SeededRandom, queens: &mut Vec<(usize, usize)>) -> bool {
        let row = queens.len();
        if row >= size {
            return true;
        }
        let cols: Vec<usize> = (0..size).collect();
        let shuffled = shuffle_array(&cols, rng);
        for col in shuffled {
            if can_place_queen(queens, row, col) {
                queens.push((row, col));
                if solve(size, rng, queens) {
                    return true;
                }
                queens.pop();
            }
        }
        false
    }

    let _ = solve(size, rng, &mut queens);
    queens
}

fn generate_regions(
    size: usize,
    queens: &[(usize, usize)],
    rng: &mut SeededRandom,
) -> Vec<Vec<i32>> {
    let mut regions = vec![vec![-1_i32; size]; size];
    for (index, &(row, col)) in queens.iter().enumerate() {
        if row < size && col < size {
            regions[row][col] = i32::try_from(index).unwrap_or(0);
        }
    }

    let directions: [(i32, i32); 4] = [(-1, 0), (1, 0), (0, -1), (0, 1)];
    let mut unassigned = size.saturating_mul(size).saturating_sub(size);
    let mut iterations = 0_usize;
    let max_iterations = size.saturating_mul(size).saturating_mul(10);

    while unassigned > 0 && iterations < max_iterations {
        iterations += 1;
        // Match TS `Math.floor(random() * size)` — do not clamp; a draw of 1.0
        // yields `size` and expands nothing that iteration (empty regionCells).
        let region_index = (rng.next_f64() * size as f64).floor() as usize;
        let mut region_cells: Vec<(usize, usize)> = Vec::new();
        for r in 0..size {
            for c in 0..size {
                if regions[r][c] == i32::try_from(region_index).unwrap_or(-2) {
                    region_cells.push((r, c));
                }
            }
        }
        let shuffled_cells = shuffle_array(&region_cells, rng);
        for (r, c) in shuffled_cells {
            let shuffled_dirs = shuffle_array(&directions, rng);
            for (dr, dc) in shuffled_dirs {
                let nr = r as i32 + dr;
                let nc = c as i32 + dc;
                if nr >= 0 && nc >= 0 {
                    let nr = nr as usize;
                    let nc = nc as usize;
                    if nr < size && nc < size && regions[nr][nc] == -1 {
                        regions[nr][nc] = i32::try_from(region_index).unwrap_or(0);
                        unassigned = unassigned.saturating_sub(1);
                        break;
                    }
                }
            }
            if unassigned == 0 {
                break;
            }
        }
    }

    for r in 0..size {
        for c in 0..size {
            if regions[r][c] == -1 {
                let mut min_dist = usize::MAX;
                let mut nearest_region = 0_i32;
                for nr in 0..size {
                    for nc in 0..size {
                        if regions[nr][nc] != -1 {
                            let dist = nr.abs_diff(r) + nc.abs_diff(c);
                            if dist < min_dist {
                                min_dist = dist;
                                nearest_region = regions[nr][nc];
                            }
                        }
                    }
                }
                regions[r][c] = nearest_region;
            }
        }
    }
    regions
}

type QueensLayout = (Vec<Vec<i32>>, Vec<(usize, usize)>);

pub(super) fn try_generate(seed: i64, size: usize) -> Option<QueensLayout> {
    if size == 0 {
        return None;
    }
    let mut rng = lcg(seed);
    let mut queens = generate_queen_positions(size, &mut rng);
    let mut regions = generate_regions(size, &queens, &mut rng);
    for attempts in 0..MAX_UNIQUENESS_ATTEMPTS {
        if let Some(solution) = has_unique_solution(&regions, size) {
            return Some((regions, solution));
        }
        let mut new_rng = lcg(seed + i64::from(attempts) + 1);
        queens = generate_queen_positions(size, &mut new_rng);
        regions = generate_regions(size, &queens, &mut new_rng);
    }
    None
}
