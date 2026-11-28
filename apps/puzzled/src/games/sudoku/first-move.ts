import { GRID_SIZE, isValidPlacement, type SudokuPuzzleClientData } from './types'

type Grid = SudokuPuzzleClientData['grid']

function findBlank(grid: Grid, matches: (row: number, col: number) => boolean) {
	for (let row = 0; row < GRID_SIZE; row++) {
		for (let col = 0; col < GRID_SIZE; col++) {
			if (grid[row][col] === null && matches(row, col)) return { row, col }
		}
	}
	return undefined
}

export function firstBlank(grid: Grid) {
	return findBlank(grid, () => true)
}

/** Point to a square with one legal digit, using only the clues the player sees. */
export function firstMoveSquare(grid: Grid) {
	return findBlank(grid, (row, col) => {
		let candidates = 0
		for (let digit = 1; digit <= GRID_SIZE; digit++) {
			if (isValidPlacement(grid, row, col, digit) && ++candidates > 1) return false
		}
		return candidates === 1
	})
}
