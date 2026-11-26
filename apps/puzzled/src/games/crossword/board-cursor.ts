import {
	type CrosswordDirection,
	type CrosswordPuzzleClientData,
	type CrosswordState,
	GRID_SIZE,
	hasDownClues,
	resolveDirection,
} from './types'

type Cell = NonNullable<CrosswordState['selectedCell']>
type Grid = CrosswordPuzzleClientData['grid']

export function selectCell(
	state: CrosswordState,
	puzzleData: CrosswordPuzzleClientData,
	row: number,
	col: number,
	direction?: CrosswordDirection,
): CrosswordState {
	if (puzzleData.grid[row]?.[col] == null) return state

	// Selecting the same cell without an explicit direction toggles it.
	if (!direction && state.selectedCell?.row === row && state.selectedCell?.col === col) {
		return toggleDirection(state, puzzleData.clues)
	}

	return {
		...state,
		selectedCell: { row, col },
		direction: resolveDirection(direction ?? state.direction, puzzleData.clues),
		startTime: state.startTime ?? Date.now(),
	}
}

export function toggleDirection(
	state: CrosswordState,
	clues: CrosswordPuzzleClientData['clues'],
): CrosswordState {
	if (!hasDownClues(clues)) return state
	return { ...state, direction: state.direction === 'across' ? 'down' : 'across' }
}

export function nextCell({ row, col }: Cell, direction: CrosswordDirection, grid: Grid) {
	if (direction === 'across') {
		col++
		while (col < GRID_SIZE && grid[row][col] === null) col++
	} else {
		row++
		while (row < GRID_SIZE && grid[row]?.[col] === null) row++
	}

	if (row < GRID_SIZE && col < GRID_SIZE && grid[row]?.[col] !== null) return { row, col }
}

export function previousCell({ row, col }: Cell, direction: CrosswordDirection, grid: Grid) {
	if (direction === 'across') {
		col--
		while (col >= 0 && grid[row][col] === null) col--
	} else {
		row--
		while (row >= 0 && grid[row]?.[col] === null) row--
	}

	if (row >= 0 && col >= 0 && grid[row]?.[col] !== null) return { row, col }
}

export function moveCursor(state: CrosswordState, grid: Grid, delta: 1 | -1): CrosswordState {
	if (!state.selectedCell) return state
	const step = delta === 1 ? nextCell : previousCell
	const selectedCell = step(state.selectedCell, state.direction, grid)
	return selectedCell ? { ...state, selectedCell } : state
}
