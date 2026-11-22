/**
 * Spots game hook
 * Tray select, two-click place, pick-up, rotate ends, undo, reset.
 */

import { useCallback, useReducer } from 'react'
import {
	createInitialState,
	type InternalState,
	occupyingTile,
	type PipPlaceAction,
	pipPlaceReducer,
} from './board-state'
import type { Cell, PipPlaceGameState, PipPlacePuzzleData } from './types'

export type UsePipPlaceReturn = {
	state: PipPlaceGameState
	selectTray: (index: number) => void
	touchCell: (cell: Cell) => void
	rotate: () => void
	undo: () => void
	reset: () => void
	occupyingIndex: (cell: Cell) => number
	canUndo: boolean
}

export function usePipPlace(puzzleData: PipPlacePuzzleData): UsePipPlaceReturn {
	const [internal, dispatch] = useReducer(
		(s: InternalState, a: PipPlaceAction) => pipPlaceReducer(s, a, puzzleData),
		puzzleData,
		createInitialState,
	)

	const selectTray = useCallback((index: number) => {
		dispatch({ type: 'SELECT_TRAY', index })
	}, [])

	const touchCell = useCallback((cell: Cell) => {
		dispatch({ type: 'TOUCH_CELL', cell })
	}, [])

	const rotate = useCallback(() => {
		dispatch({ type: 'ROTATE' })
	}, [])

	const undo = useCallback(() => {
		dispatch({ type: 'UNDO' })
	}, [])

	const reset = useCallback(() => {
		dispatch({ type: 'RESET' })
	}, [])

	const occupyingIndex = useCallback(
		(cell: Cell) => occupyingTile(internal.placed, cell),
		[internal.placed],
	)

	const { past: _past, ...state } = internal

	return {
		state,
		selectTray,
		touchCell,
		rotate,
		undo,
		reset,
		occupyingIndex,
		canUndo: internal.past.length > 0,
	}
}
