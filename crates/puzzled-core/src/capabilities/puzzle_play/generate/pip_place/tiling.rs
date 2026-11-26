use crate::capabilities::puzzle_play::domain::random::{shuffle_array, SeededRandom};

use super::Cell;

#[derive(Debug, Clone, Copy)]
struct Cover {
    a: Cell,
    b: Cell,
}

#[derive(Debug, Clone, Copy)]
pub(super) struct Tile {
    pub(super) a: Cell,
    pub(super) b: Cell,
    pub(super) pa: i64,
    pub(super) pb: i64,
}

fn first_empty(occupied: &[Vec<bool>]) -> Option<Cell> {
    for (row, line) in occupied.iter().enumerate() {
        for (col, taken) in line.iter().enumerate() {
            if !taken {
                return Some(Cell { row, col });
            }
        }
    }
    None
}

fn tile_dfs(
    occupied: &mut Vec<Vec<bool>>,
    result: &mut Vec<Cover>,
    rows: usize,
    cols: usize,
    random: &mut SeededRandom,
) -> bool {
    let Some(cell) = first_empty(occupied) else {
        return true;
    };
    let mut options: Vec<Cover> = Vec::new();
    if cell.col + 1 < cols && !occupied[cell.row][cell.col + 1] {
        options.push(Cover {
            a: cell,
            b: Cell {
                row: cell.row,
                col: cell.col + 1,
            },
        });
    }
    if cell.row + 1 < rows && !occupied[cell.row + 1][cell.col] {
        options.push(Cover {
            a: cell,
            b: Cell {
                row: cell.row + 1,
                col: cell.col,
            },
        });
    }
    for cover in shuffle_array(&options, random) {
        occupied[cover.a.row][cover.a.col] = true;
        occupied[cover.b.row][cover.b.col] = true;
        result.push(cover);
        if tile_dfs(occupied, result, rows, cols, random) {
            return true;
        }
        result.pop();
        occupied[cover.a.row][cover.a.col] = false;
        occupied[cover.b.row][cover.b.col] = false;
    }
    false
}

fn generate_matching(
    rows: usize,
    cols: usize,
    random: &mut SeededRandom,
) -> Result<Vec<Cover>, String> {
    let mut occupied = vec![vec![false; cols]; rows];
    let mut result = Vec::new();
    if !tile_dfs(&mut occupied, &mut result, rows, cols, random) {
        return Err("Spots generator: board is not tileable".to_string());
    }
    Ok(result)
}

fn double_set(max_pip: i64) -> Vec<(i64, i64)> {
    let mut out = Vec::new();
    for a in 0..=max_pip {
        for b in a..=max_pip {
            out.push((a, b));
        }
    }
    out
}

fn assign_tiles(covers: &[Cover], max_pip: i64, random: &mut SeededRandom) -> Vec<Tile> {
    let set = shuffle_array(&double_set(max_pip), random);
    covers
        .iter()
        .enumerate()
        .map(|(i, cover)| {
            let pair = set.get(i).copied().unwrap_or((0, 0));
            if random.next_f64() < 0.5 {
                Tile {
                    a: cover.a,
                    b: cover.b,
                    pa: pair.0,
                    pb: pair.1,
                }
            } else {
                Tile {
                    a: cover.a,
                    b: cover.b,
                    pa: pair.1,
                    pb: pair.0,
                }
            }
        })
        .collect()
}

pub(super) fn pip_at(tiles: &[Tile], cell: Cell) -> Option<i64> {
    for tile in tiles {
        if tile.a == cell {
            return Some(tile.pa);
        }
        if tile.b == cell {
            return Some(tile.pb);
        }
    }
    None
}

pub(super) fn generate_tiles(
    rows: usize,
    cols: usize,
    max_pip: i64,
    random: &mut SeededRandom,
) -> Result<Vec<Tile>, String> {
    let covers = generate_matching(rows, cols, random)?;
    Ok(assign_tiles(&covers, max_pip, random))
}
