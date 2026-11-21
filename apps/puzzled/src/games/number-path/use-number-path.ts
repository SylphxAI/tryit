/**
 * Path game hook
 * Click and drag a Hamiltonian path that respects clues.
 */

import { useCallback, useReducer } from 'react'
import { visitCell } from './path-moves'
import type { Cell, NumberPathGameState, NumberPathPuzzleData } from './types'
import { cellsEqual, isSolved } from './types'

type NumberPathAction = { type: 'TOUCH_CELL'; cell: Cell } | { type: 'UNDO' } | { type: 'RESET' }

function createInitialState(puzzleData: NumberPathPuzzleData): NumberPathGameState {
	return {
		path: [],
		size: puzzleData.size,
		gameStatus: 'playing',
		startTime: null,
		endTime: null,
	}
}

function withWinCheck(
	state: NumberPathGameState,
	path: Cell[],
	clues: (number | null)[][],
): NumberPathGameState {
	const won = isSolved(path, clues)
	return {
		...state,
		path,
		startTime: state.startTime ?? Date.now(),
		gameStatus: won ? 'won' : 'playing',
		endTime: won ? Date.now() : state.endTime,
	}
}

function numberPathReducer(
	state: NumberPathGameState,
	action: NumberPathAction,
	puzzleData: NumberPathPuzzleData,
): NumberPathGameState {
	switch (action.type) {
		case 'TOUCH_CELL': {
			if (state.gameStatus !== 'playing') return state
			const path = visitCell(puzzleData, state.path, action.cell)
			return path === state.path ? state : withWinCheck(state, path, puzzleData.clues)
		}

		case 'UNDO': {
			if (state.gameStatus !== 'playing') return state
			if (state.path.length === 0) return state
			return {
				...state,
				path: state.path.slice(0, -1),
			}
		}

		case 'RESET': {
			if (state.gameStatus !== 'playing') return state
			return createInitialState(puzzleData)
		}

		default:
			return state
	}
}

export type UseNumberPathReturn = {
	state: NumberPathGameState
	touchCell: (cell: Cell) => void
	undo: () => void
	reset: () => void
	isOnPath: (cell: Cell) => boolean
	visitNumber: (cell: Cell) => number | null
}

export function useNumberPath(puzzleData: NumberPathPuzzleData): UseNumberPathReturn {
	const [state, dispatch] = useReducer(
		(s: NumberPathGameState, a: NumberPathAction) => numberPathReducer(s, a, puzzleData),
		puzzleData,
		createInitialState,
	)

	const touchCell = useCallback((cell: Cell) => {
		dispatch({ type: 'TOUCH_CELL', cell })
	}, [])

	const undo = useCallback(() => {
		dispatch({ type: 'UNDO' })
	}, [])

	const reset = useCallback(() => {
		dispatch({ type: 'RESET' })
	}, [])

	const isOnPath = useCallback(
		(cell: Cell) => state.path.some((step) => cellsEqual(step, cell)),
		[state.path],
	)

	const visitNumber = useCallback(
		(cell: Cell) => {
			const idx = state.path.findIndex((step) => cellsEqual(step, cell))
			return idx >= 0 ? idx + 1 : null
		},
		[state.path],
	)

	return {
		state,
		touchCell,
		undo,
		reset,
		isOnPath,
		visitNumber,
	}
}
