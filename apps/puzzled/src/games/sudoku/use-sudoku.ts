/**
 * Sudoku Game Hook
 * Manages game state and logic for the Sudoku puzzle
 */

import { useCallback, useEffect, useReducer } from 'react'
import { createInitialState, type SudokuAction, sudokuReducer } from './state'
import { GRID_SIZE, type SudokuPuzzleClientData, type SudokuState } from './types'

export type UseSudokuReturn = {
	state: SudokuState
	selectCell: (row: number, col: number) => void
	inputNumber: (value: number) => void
	clearCell: () => void
	undo: () => void
	canUndo: boolean
	toggleNotesMode: () => void
	move: (direction: 'up' | 'down' | 'left' | 'right') => void
	checkCompletion: () => void
	reset: () => void
	getConflictingCells: () => Set<string>
}

export function useSudoku(puzzleData: SudokuPuzzleClientData): UseSudokuReturn {
	const [state, dispatch] = useReducer(
		(s: SudokuState, a: SudokuAction) => sudokuReducer(s, a, puzzleData),
		puzzleData,
		createInitialState,
	)

	// Keyboard handler
	useEffect(() => {
		function handleKeyDown(e: KeyboardEvent) {
			// Ignore if typing in input or textarea
			if (
				e.target instanceof HTMLInputElement ||
				e.target instanceof HTMLTextAreaElement ||
				(e.target instanceof HTMLElement && e.target.isContentEditable)
			) {
				return
			}

			if (e.ctrlKey || e.metaKey) {
				if (e.key.toLowerCase() === 'z' && !e.shiftKey && !e.altKey) {
					e.preventDefault()
					dispatch({ type: 'UNDO' })
				}
				return
			}

			if (e.key >= '1' && e.key <= '9') {
				e.preventDefault()
				dispatch({ type: 'INPUT_NUMBER', value: Number.parseInt(e.key, 10) })
			} else if (e.key === 'Backspace' || e.key === 'Delete' || e.key === '0') {
				e.preventDefault()
				dispatch({ type: 'CLEAR_CELL' })
			} else if (e.key === 'ArrowUp') {
				e.preventDefault()
				dispatch({ type: 'MOVE', direction: 'up' })
			} else if (e.key === 'ArrowDown') {
				e.preventDefault()
				dispatch({ type: 'MOVE', direction: 'down' })
			} else if (e.key === 'ArrowLeft') {
				e.preventDefault()
				dispatch({ type: 'MOVE', direction: 'left' })
			} else if (e.key === 'ArrowRight') {
				e.preventDefault()
				dispatch({ type: 'MOVE', direction: 'right' })
			} else if (e.key === 'n' || e.key === 'N') {
				e.preventDefault()
				dispatch({ type: 'TOGGLE_NOTES_MODE' })
			}
		}

		window.addEventListener('keydown', handleKeyDown)
		return () => window.removeEventListener('keydown', handleKeyDown)
	}, [])

	// Note: Completion is now checked inline in the reducer after INPUT_NUMBER
	// This ensures instant feedback without needing a useEffect with tricky dependencies

	const selectCell = useCallback((row: number, col: number) => {
		dispatch({ type: 'SELECT_CELL', row, col })
	}, [])

	const inputNumber = useCallback((value: number) => {
		dispatch({ type: 'INPUT_NUMBER', value })
	}, [])

	const clearCell = useCallback(() => {
		dispatch({ type: 'CLEAR_CELL' })
	}, [])

	const undo = useCallback(() => {
		dispatch({ type: 'UNDO' })
	}, [])

	const toggleNotesMode = useCallback(() => {
		dispatch({ type: 'TOGGLE_NOTES_MODE' })
	}, [])

	const move = useCallback((direction: 'up' | 'down' | 'left' | 'right') => {
		dispatch({ type: 'MOVE', direction })
	}, [])

	const checkCompletion = useCallback(() => {
		dispatch({ type: 'CHECK_COMPLETION' })
	}, [])

	const reset = useCallback(() => {
		dispatch({ type: 'RESET' })
	}, [])

	// Get cells that have conflicts (same number in row, column, or box)
	const getConflictingCells = useCallback((): Set<string> => {
		const conflicts = new Set<string>()

		// Check each cell for conflicts
		for (let row = 0; row < GRID_SIZE; row++) {
			for (let col = 0; col < GRID_SIZE; col++) {
				const value = state.userGrid[row]?.[col]?.value
				if (value === null) continue

				// Check row
				for (let c = 0; c < GRID_SIZE; c++) {
					if (c !== col && state.userGrid[row][c]?.value === value) {
						conflicts.add(`${row},${col}`)
						conflicts.add(`${row},${c}`)
					}
				}

				// Check column
				for (let r = 0; r < GRID_SIZE; r++) {
					if (r !== row && state.userGrid[r][col]?.value === value) {
						conflicts.add(`${row},${col}`)
						conflicts.add(`${r},${col}`)
					}
				}

				// Check 3x3 box
				const boxRow = Math.floor(row / 3) * 3
				const boxCol = Math.floor(col / 3) * 3
				for (let r = boxRow; r < boxRow + 3; r++) {
					for (let c = boxCol; c < boxCol + 3; c++) {
						if ((r !== row || c !== col) && state.userGrid[r][c]?.value === value) {
							conflicts.add(`${row},${col}`)
							conflicts.add(`${r},${c}`)
						}
					}
				}
			}
		}

		return conflicts
	}, [state.userGrid])

	return {
		state,
		selectCell,
		inputNumber,
		clearCell,
		undo,
		canUndo: !state.isComplete && state.history.length > 0,
		toggleNotesMode,
		move,
		checkCompletion,
		reset,
		getConflictingCells,
	}
}
