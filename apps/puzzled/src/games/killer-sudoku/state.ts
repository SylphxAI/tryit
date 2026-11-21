import {
	isSolved,
	type KillerCell,
	type KillerSudokuGameState,
	type KillerSudokuPuzzleData,
} from './types'

export type KillerSudokuAction =
	| { type: 'SELECT_CELL'; row: number; col: number }
	| { type: 'SET_VALUE'; value: number }
	| { type: 'CLEAR_CELL' }
	| { type: 'TOGGLE_NOTE'; value: number }
	| { type: 'TOGGLE_NOTES_MODE' }
	| { type: 'RESET' }

export function createInitialState(puzzleData: KillerSudokuPuzzleData): KillerSudokuGameState {
	// Create cell-to-cage mapping
	const cellToCage = new Map<string, number>()
	puzzleData.cages.forEach((cage, cageIndex) => {
		for (const [row, col] of cage.cells) {
			cellToCage.set(`${row},${col}`, cageIndex)
		}
	})

	// Create initial cells
	const cells: KillerCell[][] = []
	for (let r = 0; r < 9; r++) {
		cells[r] = []
		for (let c = 0; c < 9; c++) {
			const value = puzzleData.grid[r][c]
			cells[r][c] = {
				value,
				isGiven: value !== null,
				notes: new Set<number>(),
				cageId: cellToCage.get(`${r},${c}`) ?? 0,
			}
		}
	}

	return {
		cells,
		selectedCell: null,
		notesMode: false,
		gameStatus: 'playing',
		startTime: null,
		endTime: null,
		mistakes: 0,
	}
}

export function killerSudokuReducer(
	state: KillerSudokuGameState,
	action: KillerSudokuAction,
	puzzleData: KillerSudokuPuzzleData,
): KillerSudokuGameState {
	switch (action.type) {
		case 'SELECT_CELL': {
			if (state.gameStatus !== 'playing') return state
			const { row, col } = action
			const cell = state.cells[row][col]

			// A given may be selected, but edits below leave it unchanged.
			if (cell.isGiven) {
				return { ...state, selectedCell: [row, col] }
			}

			return {
				...state,
				selectedCell: [row, col],
				startTime: state.startTime ?? Date.now(),
			}
		}

		case 'SET_VALUE': {
			if (state.gameStatus !== 'playing') return state
			if (!state.selectedCell) return state

			const [row, col] = state.selectedCell
			const cell = state.cells[row][col]
			if (cell.isGiven) return state

			const { value } = action

			if (state.notesMode) {
				// Toggle note
				const newNotes = new Set(cell.notes)
				if (newNotes.has(value)) {
					newNotes.delete(value)
				} else {
					newNotes.add(value)
				}

				const newCells = state.cells.map((r, ri) =>
					r.map((c, ci) => (ri === row && ci === col ? { ...c, notes: newNotes, value: null } : c)),
				)

				return { ...state, cells: newCells }
			}

			// Set value
			const newCells = state.cells.map((r, ri) =>
				r.map((c, ci) =>
					ri === row && ci === col ? { ...c, value, notes: new Set<number>() } : c,
				),
			)

			// Check if solved
			const solved = isSolved(newCells, puzzleData.cages)

			return {
				...state,
				cells: newCells,
				gameStatus: solved ? 'won' : 'playing',
				endTime: solved ? Date.now() : null,
			}
		}

		case 'CLEAR_CELL': {
			if (state.gameStatus !== 'playing') return state
			if (!state.selectedCell) return state

			const [row, col] = state.selectedCell
			const cell = state.cells[row][col]
			if (cell.isGiven) return state

			const newCells = state.cells.map((r, ri) =>
				r.map((c, ci) =>
					ri === row && ci === col ? { ...c, value: null, notes: new Set<number>() } : c,
				),
			)

			return { ...state, cells: newCells }
		}

		case 'TOGGLE_NOTE': {
			if (state.gameStatus !== 'playing') return state
			if (!state.selectedCell) return state

			const [row, col] = state.selectedCell
			const cell = state.cells[row][col]
			if (cell.isGiven) return state

			const { value } = action
			const newNotes = new Set(cell.notes)
			if (newNotes.has(value)) {
				newNotes.delete(value)
			} else {
				newNotes.add(value)
			}

			const newCells = state.cells.map((r, ri) =>
				r.map((c, ci) => (ri === row && ci === col ? { ...c, notes: newNotes } : c)),
			)

			return { ...state, cells: newCells }
		}

		case 'TOGGLE_NOTES_MODE': {
			return { ...state, notesMode: !state.notesMode }
		}

		case 'RESET': {
			return createInitialState(puzzleData)
		}

		default:
			return state
	}
}
