use std::collections::{HashSet, VecDeque};

use super::configuration::{Block, EXIT_X, EXIT_Y, GRID_HEIGHT, GRID_WIDTH};

/// Pack block positions (x: 2 bits, y: 3 bits each; at most 9 blocks).
fn pack(pos: &[(i32, i32)]) -> u64 {
    pos.iter().enumerate().fold(0u64, |acc, (i, &(x, y))| {
        acc | ((((x as u64) << 3) | y as u64) << (5 * i))
    })
}

fn unpack(key: u64, n: usize) -> Vec<(i32, i32)> {
    (0..n)
        .map(|i| {
            let v = (key >> (5 * i)) & 0x1f;
            ((v >> 3) as i32, (v & 0x7) as i32)
        })
        .collect()
}

/// Most states one solve may hold. Keyed by board layout, a solve visits at
/// most 964,656 states (the biggest block mix the generator makes: one 1x2,
/// one 2x1 and six 1x1 blocks around the target, two cells empty), so this
/// never changes an answer; it keeps the solver's memory under about 50 MiB
/// even if the generator changes.
const MAX_STATES: usize = 1 << 20;

/// BFS minimum moves (any block, one cell, four directions), within
/// `max_moves`, and the number of states visited. BFS depth is
/// order-independent, so this equals the TS solver's answer.
///
/// A state is the board layout: the target, then each group of same-sized
/// blocks as a sorted set of positions. Swapping two same-sized blocks gives
/// the same layout and the same distance to the exit, so the answer is
/// unchanged, but the visited set no longer holds every ordering of
/// interchangeable blocks (20.5 million states, about 500 MiB, for the
/// 2026-09-17 hard puzzle).
pub(super) fn solve(blocks: &[Block], max_moves: u32) -> (Option<u32>, usize) {
    let Some(target) = blocks.iter().position(|b| b.is_target) else {
        return (None, 0);
    };
    // The target first, then the other blocks grouped by size.
    let mut order: Vec<usize> = (0..blocks.len()).filter(|&i| i != target).collect();
    order.sort_by_key(|&i| (blocks[i].width, blocks[i].height));
    order.insert(0, target);
    let n = order.len();
    let sizes: Vec<(i32, i32)> = order
        .iter()
        .map(|&i| (blocks[i].width, blocks[i].height))
        .collect();
    let mut groups = Vec::new();
    let mut at = 1;
    for run in sizes[1..].chunk_by(|a, b| a == b) {
        if run.len() > 1 {
            groups.push(at..at + run.len());
        }
        at += run.len();
    }
    let canonical = |pos: &mut [(i32, i32)]| {
        for group in &groups {
            pos[group.clone()].sort_unstable();
        }
    };
    let mut start: Vec<(i32, i32)> = order.iter().map(|&i| (blocks[i].x, blocks[i].y)).collect();
    if start[0] == (EXIT_X, EXIT_Y) {
        return (Some(0), 1);
    }
    canonical(&mut start);
    let start_key = pack(&start);
    let mut visited: HashSet<u64> = HashSet::new();
    visited.insert(start_key);
    let mut queue = VecDeque::from([(start_key, 0u32)]);
    let dirs = [(0, -1), (0, 1), (-1, 0), (1, 0)];
    while let Some((key, moves)) = queue.pop_front() {
        if moves >= max_moves {
            continue;
        }
        let pos = unpack(key, n);
        let mut grid = [[usize::MAX; 4]; 5];
        for (j, &(x, y)) in pos.iter().enumerate() {
            for yy in y..y + sizes[j].1 {
                for xx in x..x + sizes[j].0 {
                    grid[yy as usize][xx as usize] = j;
                }
            }
        }
        for i in 0..n {
            for (dx, dy) in dirs {
                let (nx, ny) = (pos[i].0 + dx, pos[i].1 + dy);
                let (w, h) = sizes[i];
                if nx < 0 || ny < 0 || nx + w > GRID_WIDTH || ny + h > GRID_HEIGHT {
                    continue;
                }
                let free = (ny..ny + h).all(|yy| {
                    (nx..nx + w).all(|xx| {
                        let owner = grid[yy as usize][xx as usize];
                        owner == usize::MAX || owner == i
                    })
                });
                if !free {
                    continue;
                }
                let mut next = pos.clone();
                next[i] = (nx, ny);
                canonical(&mut next);
                let next_key = pack(&next);
                if !visited.insert(next_key) {
                    continue;
                }
                if next[0] == (EXIT_X, EXIT_Y) {
                    return (Some(moves + 1), visited.len());
                }
                if visited.len() >= MAX_STATES {
                    return (None, visited.len());
                }
                queue.push_back((next_key, moves + 1));
            }
        }
    }
    (None, visited.len())
}
