import type { SudokuCell, SudokuPuzzleClientData, SudokuState } from './types'
import { GRID_SIZE, isGridSolved } from './types'

// Actions for the reducer
export type SudokuAction =
	| { type: 'SELECT_CELL'; row: number; col: number }
	| { type: 'INPUT_NUMBER'; value: number }
	| { type: 'CLEAR_CELL' }
	| { type: 'TOGGLE_NOTES_MODE' }
	| { type: 'ADD_NOTE'; value: number }
	| { type: 'REMOVE_NOTE'; value: number }
	| { type: 'MOVE'; direction: 'up' | 'down' | 'left' | 'right' }
	| { type: 'CHECK_COMPLETION' }
	| { type: 'UNDO' }
	| { type: 'RESET' }

export function createInitialState(puzzleData: SudokuPuzzleClientData): SudokuState {
	// Create user grid from puzzle
	const userGrid: SudokuCell[][] = []
	for (let row = 0; row < GRID_SIZE; row++) {
		userGrid[row] = []
		for (let col = 0; col < GRID_SIZE; col++) {
			const value = puzzleData.grid[row][col]
			userGrid[row][col] = {
				value,
				isGiven: value !== null,
				notes: new Set<number>(),
			}
		}
	}

	return {
		userGrid,
		selectedCell: null,
		history: [],
		isComplete: false,
		errors: 0,
		startTime: null,
		endTime: null,
		isNotesMode: false,
	}
}

function applySudokuAction(
	state: SudokuState,
	action: SudokuAction,
	puzzleData: SudokuPuzzleClientData,
): SudokuState {
	switch (action.type) {
		case 'SELECT_CELL': {
			const { row, col } = action
			if (row < 0 || row >= GRID_SIZE || col < 0 || col >= GRID_SIZE) return state

			return {
				...state,
				selectedCell: { row, col },
				startTime: state.startTime ?? Date.now(),
			}
		}

		case 'INPUT_NUMBER': {
			if (!state.selectedCell || state.isComplete) return state

			const { row, col } = state.selectedCell
			const cell = state.userGrid[row][col]

			// Don't modify given cells
			if (cell.isGiven) return state

			// If in notes mode, toggle note on EMPTY cells only
			if (state.isNotesMode) {
				// Can't add notes to a cell that already has a value
				if (cell.value !== null) return state

				const newGrid = state.userGrid.map((r) => r.map((c) => ({ ...c, notes: new Set(c.notes) })))
				const notes = newGrid[row][col].notes

				if (notes.has(action.value)) {
					notes.delete(action.value)
				} else {
					notes.add(action.value)
				}

				return {
					...state,
					userGrid: newGrid,
					startTime: state.startTime ?? Date.now(),
				}
			}

			// Normal mode: set the value
			const newGrid = state.userGrid.map((r) => r.map((c) => ({ ...c, notes: new Set(c.notes) })))
			newGrid[row][col].value = action.value
			newGrid[row][col].notes.clear() // Clear notes when setting value

			// Auto-clear this number from notes in same row, column, and 3x3 box
			const boxRow = Math.floor(row / 3) * 3
			const boxCol = Math.floor(col / 3) * 3

			for (let i = 0; i < 9; i++) {
				// Clear from same row
				if (i !== col) {
					newGrid[row][i].notes.delete(action.value)
				}
				// Clear from same column
				if (i !== row) {
					newGrid[i][col].notes.delete(action.value)
				}
			}

			// Clear from same 3x3 box
			for (let r = boxRow; r < boxRow + 3; r++) {
				for (let c = boxCol; c < boxCol + 3; c++) {
					if (r !== row || c !== col) {
						newGrid[r][c].notes.delete(action.value)
					}
				}
			}

			// Check completion after setting a value
			const isNowComplete = isGridSolved(newGrid)

			return {
				...state,
				userGrid: newGrid,
				startTime: state.startTime ?? Date.now(),
				isComplete: isNowComplete,
				endTime: isNowComplete && !state.endTime ? Date.now() : state.endTime,
			}
		}

		case 'CLEAR_CELL': {
			if (!state.selectedCell || state.isComplete) return state

			const { row, col } = state.selectedCell
			const cell = state.userGrid[row][col]

			// Don't modify given cells
			if (cell.isGiven) return state

			const newGrid = state.userGrid.map((r) => r.map((c) => ({ ...c, notes: new Set(c.notes) })))
			newGrid[row][col].value = null
			newGrid[row][col].notes.clear()

			// Recalculate isComplete after clearing (grid is no longer complete)
			return {
				...state,
				userGrid: newGrid,
				isComplete: false, // Clearing a cell means grid is definitely not complete
			}
		}

		case 'TOGGLE_NOTES_MODE': {
			return {
				...state,
				isNotesMode: !state.isNotesMode,
			}
		}

		case 'ADD_NOTE': {
			if (!state.selectedCell || state.isComplete) return state

			const { row, col } = state.selectedCell
			const cell = state.userGrid[row][col]

			if (cell.isGiven || cell.value !== null) return state

			const newGrid = state.userGrid.map((r) => r.map((c) => ({ ...c, notes: new Set(c.notes) })))
			newGrid[row][col].notes.add(action.value)

			return {
				...state,
				userGrid: newGrid,
			}
		}

		case 'REMOVE_NOTE': {
			if (!state.selectedCell || state.isComplete) return state

			const { row, col } = state.selectedCell
			const cell = state.userGrid[row][col]

			if (cell.isGiven) return state

			const newGrid = state.userGrid.map((r) => r.map((c) => ({ ...c, notes: new Set(c.notes) })))
			newGrid[row][col].notes.delete(action.value)

			return {
				...state,
				userGrid: newGrid,
			}
		}

		case 'MOVE': {
			if (!state.selectedCell) return state

			const { row, col } = state.selectedCell
			let newRow = row
			let newCol = col

			switch (action.direction) {
				case 'up':
					newRow = Math.max(0, row - 1)
					break
				case 'down':
					newRow = Math.min(GRID_SIZE - 1, row + 1)
					break
				case 'left':
					newCol = Math.max(0, col - 1)
					break
				case 'right':
					newCol = Math.min(GRID_SIZE - 1, col + 1)
					break
			}

			return {
				...state,
				selectedCell: { row: newRow, col: newCol },
			}
		}

		case 'CHECK_COMPLETION': {
			const isComplete = isGridSolved(state.userGrid)

			return {
				...state,
				isComplete,
				endTime: isComplete && !state.endTime ? Date.now() : state.endTime,
			}
		}

		case 'RESET': {
			return createInitialState(puzzleData)
		}

		default:
			return state
	}
}

/** Restore the whole edit, including notes pruned from the edited cell's peers. */
export function sudokuReducer(
	state: SudokuState,
	action: SudokuAction,
	puzzleData: SudokuPuzzleClientData,
): SudokuState {
	if (action.type === 'UNDO') {
		const edit = state.history.at(-1)
		// A terminal board stays terminal while the existing server submission settles.
		if (state.isComplete || !edit) return state
		const userGrid = state.userGrid.map((row) => [...row])
		for (const cell of edit.cells) userGrid[cell.row][cell.col] = cell.before
		return {
			...state,
			userGrid,
			selectedCell: edit.selectedCell,
			history: state.history.slice(0, -1),
		}
	}

	const next = applySudokuAction(state, action, puzzleData)
	if (action.type === 'RESET' || next.userGrid === state.userGrid) return next
	const cells: SudokuState['history'][number]['cells'] = []
	for (let row = 0; row < GRID_SIZE; row++) {
		for (let col = 0; col < GRID_SIZE; col++) {
			const before = state.userGrid[row][col]
			const after = next.userGrid[row][col]
			if (
				before.value !== after.value ||
				before.notes.size !== after.notes.size ||
				[...before.notes].some((note) => !after.notes.has(note))
			) {
				cells.push({ row, col, before })
			}
		}
	}
	// Re-entering a value or erasing an empty cell must not hide the last real edit.
	if (cells.length === 0) return state
	return { ...next, history: [...state.history, { selectedCell: state.selectedCell, cells }] }
}
