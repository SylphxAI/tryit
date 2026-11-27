//! Nonogram line solver: decides whether a clue set has exactly one solution
//! that a player can reach by line logic alone, with no guessing.
//!
//! Each pass takes one row or column, lists every placement of its runs that
//! agrees with the cells known so far, and fixes the cells on which all those
//! placements agree. Passes repeat until nothing changes. If every cell is
//! fixed, the clues have exactly one solution. If the solver stalls, the
//! player would have to guess (the clues may have several solutions); if a
//! line has no placement, the clues have none.

/// One clue line: run lengths, `[0]` or `[]` for an empty line.
type Clue = [u32];

/// The one solution line logic reaches for these clues, or `None` when line
/// logic stalls or the clues contradict each other.
#[must_use]
pub fn line_solve(row_clues: &[Vec<u32>], col_clues: &[Vec<u32>]) -> Option<Vec<Vec<bool>>> {
    let (height, width) = (row_clues.len(), col_clues.len());
    let mut grid: Vec<Vec<Option<bool>>> = vec![vec![None; width]; height];
    loop {
        let mut changed = false;
        for r in 0..height {
            let line = grid[r].clone();
            let solved = solve_line(&row_clues[r], &line)?;
            changed |= solved != line;
            grid[r] = solved;
        }
        for c in 0..width {
            let line: Vec<Option<bool>> = grid.iter().map(|row| row[c]).collect();
            let solved = solve_line(&col_clues[c], &line)?;
            changed |= solved != line;
            for (row, cell) in grid.iter_mut().zip(solved) {
                row[c] = cell;
            }
        }
        if !changed {
            break;
        }
    }
    grid.into_iter()
        .map(|row| row.into_iter().collect::<Option<Vec<bool>>>())
        .collect()
}

/// The cells of one line fixed by every placement that fits `known`, or
/// `None` when no placement fits.
fn solve_line(clue: &Clue, known: &[Option<bool>]) -> Option<Vec<Option<bool>>> {
    let runs: Vec<usize> = clue
        .iter()
        .filter(|&&n| n > 0)
        .map(|&n| n as usize)
        .collect();
    let mut can_fill = vec![false; known.len()];
    let mut can_empty = vec![false; known.len()];
    let mut line = vec![false; known.len()];
    if !place(&runs, 0, known, &mut line, &mut can_fill, &mut can_empty) {
        return None;
    }
    Some(
        can_fill
            .iter()
            .zip(&can_empty)
            .map(|(&fill, &empty)| (fill != empty).then_some(fill))
            .collect(),
    )
}

/// Place `runs` from cell `start` onward in every way that agrees with
/// `known`, recording each complete placement. True when any placement fits.
fn place(
    runs: &[usize],
    start: usize,
    known: &[Option<bool>],
    line: &mut [bool],
    can_fill: &mut [bool],
    can_empty: &mut [bool],
) -> bool {
    let len = known.len();
    let Some((&run, rest)) = runs.split_first() else {
        // No runs left: the rest of the line is empty.
        if known[start..].contains(&Some(true)) {
            return false;
        }
        line[start..].fill(false);
        for i in 0..len {
            can_fill[i] |= line[i];
            can_empty[i] |= !line[i];
        }
        return true;
    };
    let needed: usize = rest.iter().map(|r| r + 1).sum::<usize>() + run;
    let mut any = false;
    let mut at = start;
    while at + needed <= len {
        let gap_ok = !known[start..at].contains(&Some(true));
        if !gap_ok {
            break;
        }
        let run_ok = !known[at..at + run].contains(&Some(false));
        let end = at + run;
        let sep_ok = end == len || known[end] != Some(true);
        if run_ok && sep_ok {
            line[start..at].fill(false);
            line[at..end].fill(true);
            let next = if end < len {
                line[end] = false;
                end + 1
            } else {
                end
            };
            any |= place(rest, next, known, line, can_fill, can_empty);
        }
        at += 1;
    }
    any
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::capabilities::puzzle_play::domain::nonogram_clues::generate_clues;

    #[test]
    fn unique_clues_are_solved_by_line_logic() {
        let grid = vec![
            vec![true, true, true],
            vec![false, false, false],
            vec![false, true, false],
        ];
        let (rows, cols) = generate_clues(&grid);
        assert_eq!(line_solve(&rows, &cols), Some(grid));
    }

    #[test]
    fn two_solution_clues_are_refused() {
        // Both diagonals meet rows [1],[1] and columns [1],[1].
        let (rows, cols) = generate_clues(&[vec![true, false], vec![false, true]]);
        assert_eq!(line_solve(&rows, &cols), None);
    }

    #[test]
    fn contradictory_clues_are_refused() {
        assert_eq!(line_solve(&[vec![2], vec![0]], &[vec![0], vec![0]]), None);
    }
}
