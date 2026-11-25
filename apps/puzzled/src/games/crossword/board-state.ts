import type {
	CrosswordClue,
	CrosswordDirection,
	CrosswordPuzzleClientData,
	CrosswordState,
} from './types'
import { GRID_SIZE, hasDownClues, isClueFilled, isGridFilled, resolveDirection } from './types'

// Actions for the reducer
export type CrosswordAction =
	| { type: 'SELECT_CELL'; row: number; col: number; direction?: CrosswordDirection }
	| { type: 'TOGGLE_DIRECTION' }
	| { type: 'STEP_CLUE'; delta: 1 | -1 }
	| { type: 'SET_DIRECTION'; direction: CrosswordDirection }
	| { type: 'INPUT_LETTER'; letter: string }
	| { type: 'DELETE_LETTER' }
	| { type: 'MOVE_NEXT' }
	| { type: 'MOVE_PREV' }
	| { type: 'CHECK_PROGRESS'; puzzleData: CrosswordPuzzleClientData }
	| { type: 'MARK_COMPLETE' }
	| { type: 'RESET' }

export function inClue(
	clue: CrosswordClue,
	row: number,
	col: number,
	direction: CrosswordDirection,
) {
	return direction === 'across'
		? row === clue.row && col >= clue.col && col < clue.col + clue.length
		: col === clue.col && row >= clue.row && row < clue.row + clue.length
}

export function findActiveClue(state: CrosswordState, clues: CrosswordPuzzleClientData['clues']) {
	const { selectedCell, direction } = state
	if (!selectedCell) return undefined
	return clues[direction].find((clue) =>
		inClue(clue, selectedCell.row, selectedCell.col, direction),
	)
}

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
				return crosswordReducer(state, { type: 'TOGGLE_DIRECTION' }, puzzleData)
			}

			return {
				...state,
				selectedCell: { row, col },
				direction: resolveDirection(action.direction ?? state.direction, puzzleData.clues),
				startTime: state.startTime ?? Date.now(),
			}
		}

		case 'TOGGLE_DIRECTION': {
			if (!hasDownClues(puzzleData.clues)) return state
			return { ...state, direction: state.direction === 'across' ? 'down' : 'across' }
		}

		case 'STEP_CLUE': {
			const { clues } = puzzleData
			const ordered = clues.across.map<{ clue: CrosswordClue; direction: CrosswordDirection }>(
				(clue) => ({ clue, direction: 'across' }),
			)
			if (hasDownClues(clues)) {
				for (const clue of clues.down) ordered.push({ clue, direction: 'down' })
			}
			const count = ordered.length
			if (count <= 1) return state

			const active = findActiveClue(state, clues)
			const index = ordered.findIndex(
				({ clue, direction }) => clue === active && direction === state.direction,
			)
			const target =
				index < 0 ? (action.delta === 1 ? 0 : count - 1) : (index + action.delta + count) % count
			const { clue, direction } = ordered[target]
			let selectedCell = { row: clue.row, col: clue.col }
			if (puzzleData.grid[clue.row]?.[clue.col] == null) return state
			for (let offset = 0; offset < clue.length; offset++) {
				const row = clue.row + (direction === 'down' ? offset : 0)
				const col = clue.col + (direction === 'across' ? offset : 0)
				const letter = state.userGrid[row]?.[col]
				if (letter == null) break
				if (letter.trim() === '') {
					selectedCell = { row, col }
					break
				}
			}
			return { ...state, selectedCell, direction }
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
