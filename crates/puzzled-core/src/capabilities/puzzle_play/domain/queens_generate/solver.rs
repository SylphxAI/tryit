pub(super) fn has_unique_solution(
    regions: &[Vec<i32>],
    size: usize,
) -> Option<Vec<(usize, usize)>> {
    let mut solutions: Vec<Vec<(usize, usize)>> = Vec::new();

    fn can_place(regions: &[Vec<i32>], queens: &[(usize, usize)], row: usize, col: usize) -> bool {
        for &(r, c) in queens {
            if c == col {
                return false;
            }
            if r.abs_diff(row) <= 1 && c.abs_diff(col) <= 1 {
                return false;
            }
            if regions[r][c] == regions[row][col] {
                return false;
            }
        }
        true
    }

    fn solve(
        regions: &[Vec<i32>],
        size: usize,
        row: usize,
        queens: &mut Vec<(usize, usize)>,
        solutions: &mut Vec<Vec<(usize, usize)>>,
    ) {
        if solutions.len() > 1 {
            return;
        }
        if row >= size {
            solutions.push(queens.clone());
            return;
        }
        for col in 0..size {
            if can_place(regions, queens, row, col) {
                queens.push((row, col));
                solve(regions, size, row + 1, queens, solutions);
                queens.pop();
            }
        }
    }

    let mut queens = Vec::with_capacity(size);
    solve(regions, size, 0, &mut queens, &mut solutions);
    if solutions.len() == 1 {
        solutions.pop()
    } else {
        None
    }
}
