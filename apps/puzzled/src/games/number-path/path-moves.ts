import { type Cell, cellsEqual, isOrthogonalNeighbor, type NumberPathPuzzleData } from './types'

type VisitResult =
	| { kind: 'move'; path: Cell[] }
	| { kind: 'wrongClue'; clue: number; expected: number }
	| { kind: 'head' | 'outside' | 'startAtOne' | 'nextSquare' }

/** A previously visited tile rewinds the path; a new tile must be a legal next step. */
export function visitCell(puzzle: NumberPathPuzzleData, path: Cell[], cell: Cell): VisitResult {
	const { row, col } = cell
	if (!Number.isInteger(row) || !Number.isInteger(col)) return { kind: 'outside' }
	if (row < 0 || col < 0 || row >= puzzle.size || col >= puzzle.size) {
		return { kind: 'outside' }
	}
	const clue = puzzle.clues[row][col]
	if (path.length === 0) {
		return clue === 1 ? { kind: 'move', path: [cell] } : { kind: 'startAtOne' }
	}
	const previous = path.findIndex((step) => cellsEqual(step, cell))
	if (previous === path.length - 1) return { kind: 'head' }
	if (previous >= 0) return { kind: 'move', path: path.slice(0, previous + 1) }
	if (!isOrthogonalNeighbor(path[path.length - 1], cell)) return { kind: 'nextSquare' }
	const expected = path.length + 1
	if (clue !== null && clue !== expected) return { kind: 'wrongClue', clue, expected }
	return { kind: 'move', path: [...path, cell] }
}
