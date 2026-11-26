use std::collections::{HashSet, VecDeque};

use super::moves::{can_move, is_win, move_block};
use super::types::{Block, BlockSlidePuzzle, Direction, SolveResult};

/// Default BFS depth cap.
pub const DEFAULT_MAX_MOVES: u32 = 150;

/// Serialize state for BFS memo: sorted `id:x,y` joined by `|`.
#[must_use]
pub fn serialize_state(blocks: &[Block]) -> String {
    let mut parts: Vec<String> = blocks
        .iter()
        .map(|b| format!("{}:{},{}", b.id, b.x, b.y))
        .collect();
    parts.sort();
    parts.join("|")
}

fn can_move_index(
    blocks: &[Block],
    block_index: usize,
    direction: Direction,
    grid_width: i32,
    grid_height: i32,
) -> bool {
    let Some(block) = blocks.get(block_index) else {
        return false;
    };
    can_move(blocks, &block.id, direction, grid_width, grid_height)
}

fn move_index(blocks: &[Block], block_index: usize, direction: Direction) -> Vec<Block> {
    let id = blocks[block_index].id.clone();
    move_block(blocks, &id, direction)
}

/// BFS shortest path; `min_moves = -1` when unsolvable within `max_moves`.
#[must_use]
pub fn solve_puzzle(puzzle: &BlockSlidePuzzle, max_moves: u32) -> SolveResult {
    let BlockSlidePuzzle {
        blocks,
        grid_width,
        grid_height,
        exit_x,
        exit_y,
        ..
    } = puzzle;

    if is_win(blocks, *exit_x, *exit_y) {
        return SolveResult {
            solvable: true,
            min_moves: 0,
        };
    }

    let initial = serialize_state(blocks);
    let mut visited: HashSet<String> = HashSet::new();
    visited.insert(initial);
    let mut queue: VecDeque<(Vec<Block>, u32)> = VecDeque::new();
    queue.push_back((blocks.clone(), 0));

    while let Some((current, moves)) = queue.pop_front() {
        if moves >= max_moves {
            continue;
        }
        for i in 0..current.len() {
            for dir in Direction::ALL {
                if !can_move_index(&current, i, dir, *grid_width, *grid_height) {
                    continue;
                }
                let next_blocks = move_index(&current, i, dir);
                let state = serialize_state(&next_blocks);
                if visited.contains(&state) {
                    continue;
                }
                visited.insert(state);
                if is_win(&next_blocks, *exit_x, *exit_y) {
                    return SolveResult {
                        solvable: true,
                        min_moves: (moves + 1) as i32,
                    };
                }
                queue.push_back((next_blocks, moves + 1));
            }
        }
    }

    SolveResult {
        solvable: false,
        min_moves: -1,
    }
}
