use std::collections::{HashMap, HashSet};

use crate::capabilities::puzzle_play::domain::random::{shuffle_array, SeededRandom};

use super::Cell;

fn cell_id(cell: Cell, cols: usize) -> usize {
    cell.row * cols + cell.col
}

fn from_id(id: usize, cols: usize) -> Cell {
    Cell {
        row: id / cols,
        col: id % cols,
    }
}

fn grid_edges(rows: usize, cols: usize) -> Vec<(usize, usize)> {
    let mut edges = Vec::new();
    for row in 0..rows {
        for col in 0..cols {
            let id = row * cols + col;
            if col + 1 < cols {
                edges.push((id, id + 1));
            }
            if row + 1 < rows {
                edges.push((id, id + cols));
            }
        }
    }
    edges
}

fn find(parent: &[usize], x: usize) -> usize {
    let mut cur = x;
    while parent[cur] != cur {
        cur = parent[cur];
    }
    cur
}

fn remap_regions(parent: &[usize], rows: usize, cols: usize) -> Option<Vec<Vec<usize>>> {
    let n = rows * cols;
    let mut roots: Vec<usize> = Vec::new();
    let mut root_index: HashMap<usize, usize> = HashMap::new();
    for i in 0..n {
        let root = find(parent, i);
        if let std::collections::hash_map::Entry::Vacant(entry) = root_index.entry(root) {
            entry.insert(roots.len());
            roots.push(root);
        }
    }
    if roots.len() < 6 || roots.len() > 8 {
        return None;
    }
    let mut sizes = vec![0usize; roots.len()];
    let mut region_of = vec![vec![0usize; cols]; rows];
    for i in 0..n {
        let idx = *root_index.get(&find(parent, i))?;
        sizes[idx] += 1;
        let cell = from_id(i, cols);
        region_of[cell.row][cell.col] = idx;
    }
    if sizes.iter().any(|size| *size < 2 || *size > 4) {
        return None;
    }
    Some(region_of)
}

/// Union by size with the TS swap rule; refuses unions past size 4.
fn union_ranked(parent: &mut [usize], size: &mut [usize], a: usize, b: usize) -> bool {
    let mut ra = find(parent, a);
    let mut rb = find(parent, b);
    if ra == rb || size[ra] + size[rb] > 4 {
        return false;
    }
    if size[ra] < size[rb] {
        std::mem::swap(&mut ra, &mut rb);
    }
    parent[rb] = ra;
    size[ra] += size[rb];
    true
}

fn try_random_regions(
    rows: usize,
    cols: usize,
    random: &mut SeededRandom,
) -> Option<Vec<Vec<usize>>> {
    let n = rows * cols;
    let mut parent: Vec<usize> = (0..n).collect();
    let mut size = vec![1usize; n];
    let edges = shuffle_array(&grid_edges(rows, cols), random);
    for &(a, b) in &edges {
        let sa = size[find(&parent, a)];
        let sb = size[find(&parent, b)];
        // `sa === 1 || sb === 1 || random() < 0.55`: the draw happens only when
        // neither side is a singleton (JS short-circuit).
        if sa == 1 || sb == 1 || random.next_f64() < 0.55 {
            union_ranked(&mut parent, &mut size, a, b);
        }
    }
    for &(a, b) in &edges {
        if size[find(&parent, a)] == 1 || size[find(&parent, b)] == 1 {
            union_ranked(&mut parent, &mut size, a, b);
        }
    }
    let component_count = |parent: &[usize]| -> usize {
        (0..n)
            .map(|i| find(parent, i))
            .collect::<HashSet<_>>()
            .len()
    };
    if component_count(&parent) > 8 {
        for &(a, b) in &edges {
            if component_count(&parent) <= 8 {
                break;
            }
            union_ranked(&mut parent, &mut size, a, b);
        }
    }
    remap_regions(&parent, rows, cols)
}

fn fallback_regions(rows: usize, cols: usize, random: &mut SeededRandom) -> Vec<Vec<usize>> {
    let n = rows * cols;
    let mut parent: Vec<usize> = (0..n).collect();
    let mut size = vec![1usize; n];
    // Plain union (no size swap), as in the TS fallback.
    let union = |parent: &mut Vec<usize>, size: &mut Vec<usize>, a: usize, b: usize| -> bool {
        let ra = find(parent, a);
        let rb = find(parent, b);
        if ra == rb || size[ra] + size[rb] > 4 {
            return false;
        }
        parent[rb] = ra;
        size[ra] += size[rb];
        true
    };
    for col in 0..cols {
        let mut row = 0;
        while row + 1 < rows {
            union(
                &mut parent,
                &mut size,
                cell_id(Cell { row, col }, cols),
                cell_id(Cell { row: row + 1, col }, cols),
            );
            row += 2;
        }
    }
    let mut adjacent: Vec<(usize, usize)> = Vec::new();
    for a in 0..n {
        for b in (a + 1)..n {
            if find(&parent, a) == find(&parent, b) {
                continue;
            }
            let (ca, cb) = (from_id(a, cols), from_id(b, cols));
            if ca.row.abs_diff(cb.row) + ca.col.abs_diff(cb.col) != 1 {
                continue;
            }
            adjacent.push((a, b));
        }
    }
    let merges_wanted = 2 + (random.next_f64() * 3.0).floor() as usize;
    let mut merged = 0;
    for (a, b) in shuffle_array(&adjacent, random) {
        if merged >= merges_wanted {
            break;
        }
        if union(&mut parent, &mut size, a, b) {
            merged += 1;
        }
    }
    if let Some(mapped) = remap_regions(&parent, rows, cols) {
        return mapped;
    }
    // Last resort: vertical dominoes, numbered column by column.
    let pairs_per_col = rows / 2;
    (0..rows)
        .map(|row| {
            (0..cols)
                .map(|col| {
                    if row / 2 < pairs_per_col {
                        col * pairs_per_col + row / 2
                    } else {
                        0
                    }
                })
                .collect()
        })
        .collect()
}

pub(super) fn generate_regions(
    rows: usize,
    cols: usize,
    random: &mut SeededRandom,
) -> Vec<Vec<usize>> {
    for _ in 0..80 {
        if let Some(found) = try_random_regions(rows, cols, random) {
            return found;
        }
    }
    fallback_regions(rows, cols, random)
}
