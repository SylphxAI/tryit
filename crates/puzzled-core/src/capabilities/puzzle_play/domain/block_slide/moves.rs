use super::types::{Block, BlockSlidePuzzle, Direction};

/// Axis-aligned rectangle overlap (strict interior; edge-touching OK).
#[must_use]
pub fn blocks_overlap(a: &Block, b: &Block) -> bool {
    !(a.x + a.width <= b.x
        || b.x + b.width <= a.x
        || a.y + a.height <= b.y
        || b.y + b.height <= a.y)
}

/// Whether the named block can move one step in `direction`.
#[must_use]
pub fn can_move(
    blocks: &[Block],
    block_id: &str,
    direction: Direction,
    grid_width: i32,
    grid_height: i32,
) -> bool {
    let Some(block) = blocks.iter().find(|b| b.id == block_id) else {
        return false;
    };
    let (dx, dy) = direction.delta();
    let new_x = block.x + dx;
    let new_y = block.y + dy;
    if new_x < 0 || new_y < 0 {
        return false;
    }
    if new_x + block.width > grid_width {
        return false;
    }
    if new_y + block.height > grid_height {
        return false;
    }
    let mut moved = block.clone();
    moved.x = new_x;
    moved.y = new_y;
    for other in blocks {
        if other.id == block_id {
            continue;
        }
        if blocks_overlap(&moved, other) {
            return false;
        }
    }
    true
}

/// Apply one-step move; returns new block vector.
#[must_use]
pub fn move_block(blocks: &[Block], block_id: &str, direction: Direction) -> Vec<Block> {
    let (dx, dy) = direction.delta();
    blocks
        .iter()
        .map(|b| {
            if b.id != block_id {
                return b.clone();
            }
            Block {
                id: b.id.clone(),
                x: b.x + dx,
                y: b.y + dy,
                width: b.width,
                height: b.height,
                is_target: b.is_target,
            }
        })
        .collect()
}

/// Target block at exit coordinates.
#[must_use]
pub fn is_win(blocks: &[Block], exit_x: i32, exit_y: i32) -> bool {
    blocks
        .iter()
        .find(|b| b.is_target)
        .is_some_and(|t| t.x == exit_x && t.y == exit_y)
}

/// Blocks in-bounds, no overlap, exactly one target present.
#[must_use]
pub fn is_valid_configuration(puzzle: &BlockSlidePuzzle) -> bool {
    let BlockSlidePuzzle {
        blocks,
        grid_width,
        grid_height,
        ..
    } = puzzle;
    let mut has_target = false;
    for block in blocks {
        if block.is_target {
            has_target = true;
        }
        if block.x < 0 || block.y < 0 {
            return false;
        }
        if block.x + block.width > *grid_width {
            return false;
        }
        if block.y + block.height > *grid_height {
            return false;
        }
    }
    if !has_target {
        return false;
    }
    for i in 0..blocks.len() {
        for j in (i + 1)..blocks.len() {
            if blocks_overlap(&blocks[i], &blocks[j]) {
                return false;
            }
        }
    }
    true
}
