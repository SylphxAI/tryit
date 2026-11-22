import { type Cell, cellsEqual, isOrthogonalNeighbor, type NumberPathPuzzleData } from './types'

/** A previously visited tile rewinds the path; a new tile must be a legal next step. */
export function visitCell(puzzle: NumberPathPuzzleData, path: Cell[], cell: Cell): Cell[] {
	const { row, col } = cell
	if (!Number.isInteger(row) || !Number.isInteger(col)) return path
	if (row < 0 || col < 0 || row >= puzzle.size || col >= puzzle.size) return path
	const clue = puzzle.clues[row][col]
	if (path.length === 0) return clue === 1 ? [cell] : path

	const previous = path.findIndex((step) => cellsEqual(step, cell))
	if (previous >= 0) return previous === path.length - 1 ? path : path.slice(0, previous + 1)
	if (!isOrthogonalNeighbor(path[path.length - 1], cell)) return path
	if (clue !== null && clue !== path.length + 1) return path
	return [...path, cell]
}
