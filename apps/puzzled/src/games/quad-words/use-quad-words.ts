/**
 * Quordle Game Hook
 * Manages game state for the 4-word puzzle game. The server grades each
 * guess (`PuzzleService.CheckGuess`); the four words never reach the client.
 */

import { useCallback, useReducer } from 'react'
import { createInitialState, quordleReducer } from './play-state'
import { type GradeQuadGuess, type GuessResult, MAX_GUESSES, type QuordleGameState } from './types'

export type UseQuordleReturn = {
	state: QuordleGameState
	addLetter: (letter: string) => void
	deleteLetter: () => void
	submitGuess: (isValidWord: boolean) => { success: boolean; error?: string }
	reset: () => void
	getGuessResult: (boardIndex: number, guessIndex: number) => GuessResult | null
	getRemainingGuesses: () => number
	getSolvedCount: () => number
}

export function useQuadWords(grade: GradeQuadGuess, onGradeFailed?: () => void): UseQuordleReturn {
	const [state, dispatch] = useReducer(quordleReducer, undefined, createInitialState)

	const addLetter = useCallback((letter: string) => {
		dispatch({ type: 'ADD_LETTER', letter })
	}, [])

	const deleteLetter = useCallback(() => {
		dispatch({ type: 'DELETE_LETTER' })
	}, [])

	const submitGuess = useCallback(
		(isValidWord: boolean): { success: boolean; error?: string } => {
			if (state.gameStatus !== 'playing' || state.grading) {
				return { success: false, error: 'Please wait' }
			}
			if (state.currentGuess.length !== 5) {
				return { success: false, error: 'Not enough letters' }
			}

			if (!isValidWord) {
				return { success: false, error: 'Not in word list' }
			}

			const guess = state.currentGuess
			dispatch({ type: 'GRADING', grading: true })
			grade(guess).then(
				(results) => dispatch({ type: 'APPLY_GUESS', guess, results }),
				() => {
					dispatch({ type: 'GRADING', grading: false })
					onGradeFailed?.()
				},
			)
			return { success: true }
		},
		[state.gameStatus, state.grading, state.currentGuess, grade, onGradeFailed],
	)

	const reset = useCallback(() => {
		dispatch({ type: 'RESET' })
	}, [])

	const getGuessResult = useCallback(
		(boardIndex: number, guessIndex: number): GuessResult | null => {
			return state.boards[boardIndex]?.results[guessIndex] ?? null
		},
		[state.boards],
	)

	const getRemainingGuesses = useCallback(() => {
		return MAX_GUESSES - state.guessHistory.length
	}, [state.guessHistory.length])

	const getSolvedCount = useCallback(() => {
		return state.boards.filter((b) => b.solved).length
	}, [state.boards])

	return {
		state,
		addLetter,
		deleteLetter,
		submitGuess,
		reset,
		getGuessResult,
		getRemainingGuesses,
		getSolvedCount,
	}
}
