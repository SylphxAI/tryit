import { type CellState, lineRuns, type NonogramPuzzleData, sameRuns } from './types'

export function isLineMismatch(line: readonly CellState[], clue: number[]): boolean {
	const runs = lineRuns(line.map((cell) => cell === 'filled'))
	if (!line.includes('empty')) return !sameRuns(runs, clue)

	// Empty cells are still undecided, but cannot undo an oversized run or excess fill.
	const filled = runs.reduce((total, length) => total + length, 0)
	const required = clue.reduce((total, length) => total + length, 0)
	return filled > required || runs.some((length) => length > Math.max(0, ...clue))
}

/** Find zero-based indices of lines that contradict their clues, without the solution. */
export function findClueMismatches(
	grid: readonly (readonly CellState[])[],
	data: NonogramPuzzleData,
) {
	const rows: number[] = []
	const columns: number[] = []
	for (const [row, clue] of data.rowClues.entries()) {
		if (isLineMismatch(grid[row], clue)) rows.push(row)
	}
	for (const [col, clue] of data.colClues.entries()) {
		if (
			isLineMismatch(
				grid.map((line) => line[col]),
				clue,
			)
		)
			columns.push(col)
	}
	return { rows, columns }
}
