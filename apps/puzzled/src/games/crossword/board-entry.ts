import { nextCell, previousCell } from './board-cursor'
import type { CrosswordPuzzleClientData, CrosswordState } from './types'

type Grid = CrosswordPuzzleClientData['grid']

export function inputLetter(state: CrosswordState, grid: Grid, letter: string): CrosswordState {
	if (!state.selectedCell || state.isComplete) return state

	const { row, col } = state.selectedCell
	if (grid[row][col] === null) return state

	const userGrid = state.userGrid.map((r) => [...r])
	userGrid[row][col] = letter.toUpperCase()
	const selectedCell = nextCell(state.selectedCell, state.direction, grid) ?? state.selectedCell

	return {
		...state,
		userGrid,
		selectedCell,
		startTime: state.startTime ?? Date.now(),
	}
}

export function deleteLetter(state: CrosswordState, grid: Grid): CrosswordState {
	if (!state.selectedCell || state.isComplete) return state

	const { row, col } = state.selectedCell
	if (grid[row][col] === null) return state

	// Clear the current letter, or move back and clear when the current cell is empty.
	if (state.userGrid[row][col]) {
		const userGrid = state.userGrid.map((r) => [...r])
		userGrid[row][col] = ''
		return { ...state, userGrid }
	}

	const selectedCell = previousCell(state.selectedCell, state.direction, grid)
	if (!selectedCell) return state

	const userGrid = state.userGrid.map((r) => [...r])
	userGrid[selectedCell.row][selectedCell.col] = ''
	return { ...state, userGrid, selectedCell }
}
