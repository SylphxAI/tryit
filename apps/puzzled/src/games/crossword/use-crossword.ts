/**
 * Crossword Mini Game Hook
 * Manages game state and logic for the crossword puzzle
 */

import { useCallback, useEffect, useReducer } from 'react'
import { type CrosswordAction, createInitialState, crosswordReducer } from './board-state'
import type {
	CrosswordClue,
	CrosswordDirection,
	CrosswordPuzzleClientData,
	CrosswordState,
} from './types'
import { hasDownClues } from './types'

export type UseCrosswordReturn = {
	state: CrosswordState
	selectCell: (row: number, col: number) => void
	toggleDirection: () => void
	setDirection: (direction: CrosswordDirection) => void
	inputLetter: (letter: string) => void
	deleteLetter: () => void
	moveNext: () => void
	movePrev: () => void
	checkCompletion: () => void
	markComplete: () => void
	reset: () => void
	getCurrentClue: () => CrosswordClue | null
	getHighlightedCells: () => Set<string>
}

export function useCrossword(puzzleData: CrosswordPuzzleClientData): UseCrosswordReturn {
	const [state, dispatch] = useReducer(
		(s: CrosswordState, a: CrosswordAction) => crosswordReducer(s, a, puzzleData),
		puzzleData,
		createInitialState,
	)

	const acrossOnly = !hasDownClues(puzzleData.clues)

	// Keyboard handler
	useEffect(() => {
		function handleKeyDown(e: KeyboardEvent) {
			// Ignore if typing in input or textarea
			if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) {
				return
			}

			if (e.key === 'Backspace' || e.key === 'Delete') {
				e.preventDefault()
				dispatch({ type: 'DELETE_LETTER' })
			} else if (e.key === 'ArrowRight') {
				e.preventDefault()
				dispatch({ type: 'SET_DIRECTION', direction: 'across' })
				dispatch({ type: 'MOVE_NEXT' })
			} else if (e.key === 'ArrowLeft') {
				e.preventDefault()
				dispatch({ type: 'SET_DIRECTION', direction: 'across' })
				dispatch({ type: 'MOVE_PREV' })
			} else if (e.key === 'ArrowDown') {
				e.preventDefault()
				// An across-only board has no down words to walk.
				if (!acrossOnly) {
					dispatch({ type: 'SET_DIRECTION', direction: 'down' })
					dispatch({ type: 'MOVE_NEXT' })
				}
			} else if (e.key === 'ArrowUp') {
				e.preventDefault()
				if (!acrossOnly) {
					dispatch({ type: 'SET_DIRECTION', direction: 'down' })
					dispatch({ type: 'MOVE_PREV' })
				}
			} else if (e.key === 'Tab') {
				e.preventDefault()
				dispatch({ type: 'TOGGLE_DIRECTION' })
			} else if (/^[a-zA-Z]$/.test(e.key)) {
				e.preventDefault()
				dispatch({ type: 'INPUT_LETTER', letter: e.key })
			}
		}

		window.addEventListener('keydown', handleKeyDown)
		return () => window.removeEventListener('keydown', handleKeyDown)
	}, [acrossOnly])

	// Recheck fill progress when the user grid changes (no solution compare).
	// biome-ignore lint/correctness/useExhaustiveDependencies: userGrid is trigger, not used in callback
	useEffect(() => {
		dispatch({ type: 'CHECK_PROGRESS', puzzleData })
	}, [state.userGrid, puzzleData])

	const selectCell = useCallback((row: number, col: number) => {
		dispatch({ type: 'SELECT_CELL', row, col })
	}, [])

	const toggleDirection = useCallback(() => {
		dispatch({ type: 'TOGGLE_DIRECTION' })
	}, [])

	const setDirection = useCallback((direction: CrosswordDirection) => {
		dispatch({ type: 'SET_DIRECTION', direction })
	}, [])

	const inputLetter = useCallback((letter: string) => {
		dispatch({ type: 'INPUT_LETTER', letter })
	}, [])

	const deleteLetter = useCallback(() => {
		dispatch({ type: 'DELETE_LETTER' })
	}, [])

	const moveNext = useCallback(() => {
		dispatch({ type: 'MOVE_NEXT' })
	}, [])

	const movePrev = useCallback(() => {
		dispatch({ type: 'MOVE_PREV' })
	}, [])

	const checkCompletion = useCallback(() => {
		dispatch({ type: 'CHECK_PROGRESS', puzzleData })
	}, [puzzleData])

	const markComplete = useCallback(() => {
		dispatch({ type: 'MARK_COMPLETE' })
	}, [])

	const reset = useCallback(() => {
		dispatch({ type: 'RESET' })
	}, [])

	// Get the current clue based on selected cell and direction
	const getCurrentClue = useCallback((): CrosswordClue | null => {
		if (!state.selectedCell) return null

		const { row, col } = state.selectedCell
		const clues = state.direction === 'across' ? puzzleData.clues.across : puzzleData.clues.down

		for (const clue of clues) {
			if (state.direction === 'across') {
				if (clue.row === row && col >= clue.col && col < clue.col + clue.length) {
					return clue
				}
			} else {
				if (clue.col === col && row >= clue.row && row < clue.row + clue.length) {
					return clue
				}
			}
		}

		return null
	}, [state.selectedCell, state.direction, puzzleData.clues])

	// Get cells that should be highlighted (same word as selected cell)
	const getHighlightedCells = useCallback((): Set<string> => {
		const highlighted = new Set<string>()
		const currentClue = getCurrentClue()

		if (!currentClue) return highlighted

		for (let i = 0; i < currentClue.length; i++) {
			const row = state.direction === 'across' ? currentClue.row : currentClue.row + i
			const col = state.direction === 'across' ? currentClue.col + i : currentClue.col
			highlighted.add(`${row},${col}`)
		}

		return highlighted
	}, [getCurrentClue, state.direction])

	return {
		state,
		selectCell,
		toggleDirection,
		setDirection,
		inputLetter,
		deleteLetter,
		moveNext,
		movePrev,
		checkCompletion,
		markComplete,
		reset,
		getCurrentClue,
		getHighlightedCells,
	}
}
