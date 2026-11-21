/**
 * Killer Sudoku Game Hook
 * Manages game state for Killer Sudoku puzzles
 */

import { useCallback, useReducer } from 'react'
import { createInitialState, type KillerSudokuAction, killerSudokuReducer } from './state'
import type { Cage, KillerSudokuGameState, KillerSudokuPuzzleData } from './types'
import { getCellConflicts } from './types'

export type UseKillerSudokuReturn = {
	state: KillerSudokuGameState
	cages: Cage[]
	selectCell: (row: number, col: number) => void
	setValue: (value: number) => void
	clearCell: () => void
	toggleNote: (value: number) => void
	toggleNotesMode: () => void
	reset: () => void
	getCellConflicts: (row: number, col: number) => Set<string>
	getCageForCell: (row: number, col: number) => Cage | undefined
}

export function useKillerSudoku(puzzleData: KillerSudokuPuzzleData): UseKillerSudokuReturn {
	const [state, dispatch] = useReducer(
		(s: KillerSudokuGameState, a: KillerSudokuAction) => killerSudokuReducer(s, a, puzzleData),
		puzzleData,
		createInitialState,
	)

	const selectCell = useCallback((row: number, col: number) => {
		dispatch({ type: 'SELECT_CELL', row, col })
	}, [])

	const setValue = useCallback((value: number) => {
		dispatch({ type: 'SET_VALUE', value })
	}, [])

	const clearCell = useCallback(() => {
		dispatch({ type: 'CLEAR_CELL' })
	}, [])

	const toggleNote = useCallback((value: number) => {
		dispatch({ type: 'TOGGLE_NOTE', value })
	}, [])

	const toggleNotesMode = useCallback(() => {
		dispatch({ type: 'TOGGLE_NOTES_MODE' })
	}, [])

	const reset = useCallback(() => {
		dispatch({ type: 'RESET' })
	}, [])

	const getConflicts = useCallback(
		(row: number, col: number) => getCellConflicts(state.cells, puzzleData.cages, row, col),
		[state.cells, puzzleData.cages],
	)

	const getCageForCell = useCallback(
		(row: number, col: number) => {
			const cageId = state.cells[row][col].cageId
			return puzzleData.cages[cageId]
		},
		[state.cells, puzzleData.cages],
	)

	return {
		state,
		cages: puzzleData.cages,
		selectCell,
		setValue,
		clearCell,
		toggleNote,
		toggleNotesMode,
		reset,
		getCellConflicts: getConflicts,
		getCageForCell,
	}
}
