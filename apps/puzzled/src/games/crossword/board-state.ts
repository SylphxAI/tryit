import type { CrosswordDirection, CrosswordPuzzleClientData, CrosswordState } from './types'
import { GRID_SIZE, isClueFilled, isGridFilled, resolveDirection } from './types'

// Actions for the reducer
export type CrosswordAction =
	| { type: 'SELECT_CELL'; row: number; col: number; direction?: CrosswordDirection }
	| { type: 'TOGGLE_DIRECTION' }
	| { type: 'SET_DIRECTION'; direction: CrosswordDirection }
	| { type: 'INPUT_LETTER'; letter: string }
	| { type: 'DELETE_LETTER' }
	| { type: 'MOVE_NEXT' }
	| { type: 'MOVE_PREV' }
	| { type: 'CHECK_PROGRESS'; puzzleData: CrosswordPuzzleClientData }
	| { type: 'MARK_COMPLETE' }
	| { type: 'RESET' }

export function createInitialState(puzzleData: CrosswordPuzzleClientData): CrosswordState {
	// Create empty user grid matching puzzle structure
	const userGrid: (string | null)[][] = []
	for (let row = 0; row < GRID_SIZE; row++) {
		userGrid[row] = []
		for (let col = 0; col < GRID_SIZE; col++) {
			// null = black square, empty string = letter cell to fill
			userGrid[row][col] = puzzleData.grid[row][col] === null ? null : ''
		}
	}

	// Find first non-black cell
	let firstCell: { row: number; col: number } | null = null
	for (let row = 0; row < GRID_SIZE && !firstCell; row++) {
		for (let col = 0; col < GRID_SIZE && !firstCell; col++) {
			if (puzzleData.grid[row][col] !== null) {
				firstCell = { row, col }
			}
		}
	}

	return {
		userGrid,
		selectedCell: firstCell,
		direction: 'across',
		isFilled: false,
		isComplete: false,
		startTime: null,
		endTime: null,
		solvedClues: {
			across: [],
			down: [],
		},
	}
}

export function crosswordReducer(
	state: CrosswordState,
	action: CrosswordAction,
	puzzleData: CrosswordPuzzleClientData,
): CrosswordState {
	switch (action.type) {
		case 'SELECT_CELL': {
			const { row, col } = action
			// Don't select black squares
			if (puzzleData.grid[row]?.[col] == null) return state

			// If clicking same cell, toggle direction
			if (!action.direction && state.selectedCell?.row === row && state.selectedCell?.col === col) {
				return {
					...state,
					direction: resolveDirection(
						state.direction === 'across' ? 'down' : 'across',
						puzzleData.clues,
					),
				}
			}

			return {
				...state,
				selectedCell: { row, col },
				direction: resolveDirection(action.direction ?? state.direction, puzzleData.clues),
				startTime: state.startTime ?? Date.now(),
			}
		}

		case 'TOGGLE_DIRECTION': {
			return {
				...state,
				direction: resolveDirection(
					state.direction === 'across' ? 'down' : 'across',
					puzzleData.clues,
				),
			}
		}

		case 'SET_DIRECTION': {
			return {
				...state,
				direction: resolveDirection(action.direction, puzzleData.clues),
			}
		}

		case 'INPUT_LETTER': {
			if (!state.selectedCell || state.isComplete) return state

			const { row, col } = state.selectedCell
			if (puzzleData.grid[row][col] === null) return state

			// Update the grid
			const newGrid = state.userGrid.map((r) => [...r])
			newGrid[row][col] = action.letter.toUpperCase()

			// Move to next cell
			let nextRow = row
			let nextCol = col

			if (state.direction === 'across') {
				nextCol++
				while (nextCol < GRID_SIZE && puzzleData.grid[nextRow][nextCol] === null) {
					nextCol++
				}
			} else {
				nextRow++
				while (nextRow < GRID_SIZE && puzzleData.grid[nextRow]?.[nextCol] === null) {
					nextRow++
				}
			}

			// Wrap or stay if at end
			const nextCell =
				nextRow < GRID_SIZE && nextCol < GRID_SIZE && puzzleData.grid[nextRow]?.[nextCol] !== null
					? { row: nextRow, col: nextCol }
					: state.selectedCell

			return {
				...state,
				userGrid: newGrid,
				selectedCell: nextCell,
				startTime: state.startTime ?? Date.now(),
			}
		}

		case 'DELETE_LETTER': {
			if (!state.selectedCell || state.isComplete) return state

			const { row, col } = state.selectedCell
			if (puzzleData.grid[row][col] === null) return state

			// If current cell has a letter, delete it
			if (state.userGrid[row][col]) {
				const newGrid = state.userGrid.map((r) => [...r])
				newGrid[row][col] = ''
				return {
					...state,
					userGrid: newGrid,
				}
			}

			// Otherwise, move back and delete
			let prevRow = row
			let prevCol = col

			if (state.direction === 'across') {
				prevCol--
				while (prevCol >= 0 && puzzleData.grid[prevRow][prevCol] === null) {
					prevCol--
				}
			} else {
				prevRow--
				while (prevRow >= 0 && puzzleData.grid[prevRow]?.[prevCol] === null) {
					prevRow--
				}
			}

			if (prevRow >= 0 && prevCol >= 0 && puzzleData.grid[prevRow]?.[prevCol] !== null) {
				const newGrid = state.userGrid.map((r) => [...r])
				newGrid[prevRow][prevCol] = ''
				return {
					...state,
					userGrid: newGrid,
					selectedCell: { row: prevRow, col: prevCol },
				}
			}

			return state
		}

		case 'MOVE_NEXT': {
			if (!state.selectedCell) return state

			const { row, col } = state.selectedCell
			let nextRow = row
			let nextCol = col

			if (state.direction === 'across') {
				nextCol++
				while (nextCol < GRID_SIZE && puzzleData.grid[nextRow][nextCol] === null) {
					nextCol++
				}
			} else {
				nextRow++
				while (nextRow < GRID_SIZE && puzzleData.grid[nextRow]?.[nextCol] === null) {
					nextRow++
				}
			}

			if (
				nextRow < GRID_SIZE &&
				nextCol < GRID_SIZE &&
				puzzleData.grid[nextRow]?.[nextCol] !== null
			) {
				return {
					...state,
					selectedCell: { row: nextRow, col: nextCol },
				}
			}

			return state
		}

		case 'MOVE_PREV': {
			if (!state.selectedCell) return state

			const { row, col } = state.selectedCell
			let prevRow = row
			let prevCol = col

			if (state.direction === 'across') {
				prevCol--
				while (prevCol >= 0 && puzzleData.grid[prevRow][prevCol] === null) {
					prevCol--
				}
			} else {
				prevRow--
				while (prevRow >= 0 && puzzleData.grid[prevRow]?.[prevCol] === null) {
					prevRow--
				}
			}

			if (prevRow >= 0 && prevCol >= 0 && puzzleData.grid[prevRow]?.[prevCol] !== null) {
				return {
					...state,
					selectedCell: { row: prevRow, col: prevCol },
				}
			}

			return state
		}

		case 'CHECK_PROGRESS': {
			const { puzzleData: puzzle } = action
			const solvedAcross: number[] = []
			const solvedDown: number[] = []

			for (const clue of puzzle.clues.across) {
				if (isClueFilled(state.userGrid, clue, 'across')) {
					solvedAcross.push(clue.number)
				}
			}
			for (const clue of puzzle.clues.down) {
				if (isClueFilled(state.userGrid, clue, 'down')) {
					solvedDown.push(clue.number)
				}
			}

			return {
				...state,
				solvedClues: { across: solvedAcross, down: solvedDown },
				isFilled: isGridFilled(state.userGrid, puzzle.grid),
			}
		}

		case 'MARK_COMPLETE': {
			if (state.isComplete) return state
			return {
				...state,
				isComplete: true,
				endTime: state.endTime ?? Date.now(),
			}
		}

		case 'RESET': {
			return createInitialState(puzzleData)
		}

		default:
			return state
	}
}
