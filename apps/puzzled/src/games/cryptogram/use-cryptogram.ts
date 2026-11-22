/**
 * Cryptogram Game Hook
 * Manages game state for the letter substitution puzzle.
 *
 * The client never holds the plaintext: once every letter is filled the
 * server checks the decoding, and hints come from the server
 * (`PuzzleService.CheckGuess`).
 */

import { useCallback, useEffect, useReducer, useRef } from 'react'
import {
	type CryptogramAction,
	type CryptogramClientState,
	createCryptogramState,
	cryptogramReducer,
	isFullyFilled,
} from './state'
import type { CryptogramPuzzleData, PlayerGuesses } from './types'

/** Server grading: is this full decoding right, and the next hint letter. */
export type CryptogramGrader = {
	checkSolved: (guesses: PlayerGuesses) => Promise<boolean>
	hint: (
		guesses: PlayerGuesses,
		revealed: string[],
	) => Promise<{ encrypted: string; letter: string } | null>
}

export type UseCryptogramReturn = {
	state: CryptogramClientState
	setGuess: (encryptedLetter: string, guessedLetter: string) => void
	clearGuess: (encryptedLetter: string) => void
	useHint: () => void
	selectLetter: (encryptedLetter: string | null) => void
	reset: () => void
	/** Letters filled so far; correctness is only known when the server says solved. */
	getProgress: () => { filled: number; total: number }
	canUseHint: boolean
}

export function useCryptogram(
	puzzleData: CryptogramPuzzleData,
	grader: CryptogramGrader,
	onGradeFailed?: () => void,
): UseCryptogramReturn {
	const [state, dispatch] = useReducer(
		(s: CryptogramClientState, a: CryptogramAction) => cryptogramReducer(s, a, puzzleData),
		puzzleData,
		createCryptogramState,
	)
	const hintPending = useRef(false)

	// Ask the server once the decoding is complete.
	useEffect(() => {
		if (state.gameStatus !== 'playing' || !isFullyFilled(state.guesses)) return
		const guesses = state.guesses
		let cancelled = false
		grader.checkSolved(guesses).then(
			(solved) => {
				if (!cancelled) dispatch({ type: 'CHECKED', solved, guesses })
			},
			() => {
				if (!cancelled) onGradeFailed?.()
			},
		)
		return () => {
			cancelled = true
		}
	}, [state.guesses, state.gameStatus, grader, onGradeFailed])

	const setGuess = useCallback((encryptedLetter: string, guessedLetter: string) => {
		dispatch({ type: 'SET_GUESS', encryptedLetter, guessedLetter })
	}, [])

	const clearGuess = useCallback((encryptedLetter: string) => {
		dispatch({ type: 'CLEAR_GUESS', encryptedLetter })
	}, [])

	const canUseHint = state.hintsUsed < puzzleData.maxHints && state.gameStatus === 'playing'

	const useHint = useCallback(() => {
		if (!canUseHint || hintPending.current) return
		hintPending.current = true
		grader.hint(state.guesses, state.revealedLetters).then(
			(revealed) => {
				hintPending.current = false
				if (revealed) {
					dispatch({ type: 'REVEAL', encryptedLetter: revealed.encrypted, letter: revealed.letter })
				}
			},
			() => {
				hintPending.current = false
				onGradeFailed?.()
			},
		)
	}, [canUseHint, grader, state.guesses, state.revealedLetters, onGradeFailed])

	const selectLetter = useCallback((encryptedLetter: string | null) => {
		dispatch({ type: 'SELECT_LETTER', encryptedLetter })
	}, [])

	const reset = useCallback(() => {
		dispatch({ type: 'RESET' })
	}, [])

	const getProgress = useCallback(() => {
		const values = Object.values(state.guesses)
		return { filled: values.filter((v) => v !== '').length, total: values.length }
	}, [state.guesses])

	return {
		state,
		setGuess,
		clearGuess,
		useHint,
		selectLetter,
		reset,
		getProgress,
		canUseHint,
	}
}
