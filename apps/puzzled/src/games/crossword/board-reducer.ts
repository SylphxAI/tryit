import { stepClue } from './board-clues'
import { moveCursor, selectCell, toggleDirection } from './board-cursor'
import { deleteLetter, inputLetter } from './board-entry'
import {
	type CrosswordDirection,
	type CrosswordPuzzleClientData,
	type CrosswordState,
	GRID_SIZE,
	isClueFilled,
	isGridFilled,
	resolveDirection,
} from './types'

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
		case 'SELECT_CELL':
			return selectCell(state, puzzleData, action.row, action.col, action.direction)
		case 'TOGGLE_DIRECTION':
			return toggleDirection(state, puzzleData.clues)
		case 'STEP_CLUE':
			return stepClue(state, puzzleData, action.delta)
		case 'SET_DIRECTION':
			return { ...state, direction: resolveDirection(action.direction, puzzleData.clues) }
		case 'INPUT_LETTER':
			return inputLetter(state, puzzleData.grid, action.letter)
		case 'DELETE_LETTER':
			return deleteLetter(state, puzzleData.grid)
		case 'MOVE_NEXT':
			return moveCursor(state, puzzleData.grid, 1)
		case 'MOVE_PREV':
			return moveCursor(state, puzzleData.grid, -1)
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
