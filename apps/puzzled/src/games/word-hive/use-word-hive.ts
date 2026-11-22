'use client'

import { useCallback, useEffect, useReducer } from 'react'
import { triggerHaptic, triggerSound } from '@/shared/hooks'
import {
	checkHiveDraft,
	createInitialState,
	type SubmitResult,
	spellingBeeReducer,
} from './play-state'
import type { GradeHiveWord, WordHivePlayData } from './types'

export type { SubmitResult } from './play-state'

export function useWordHive(
	initialPuzzle: WordHivePlayData,
	grade: GradeHiveWord,
	onSubmitResult?: (result: SubmitResult) => void,
) {
	const [state, dispatch] = useReducer(spellingBeeReducer, initialPuzzle, createInitialState)

	const allLetters = [state.centerLetter, ...state.outerLetters]
	const validLettersSet = new Set(allLetters)

	const addLetter = useCallback((letter: string) => {
		dispatch({ type: 'ADD_LETTER', letter })
	}, [])

	const deleteLetter = useCallback(() => {
		dispatch({ type: 'DELETE_LETTER' })
	}, [])

	const shuffle = useCallback(() => {
		dispatch({ type: 'SHUFFLE' })
	}, [])

	// Try to submit current word: the rules are checked here, membership in
	// the word list by the server. The graded outcome arrives through
	// `onSubmitResult` ('success', 'pangram', 'not_in_list', 'grade_failed').
	const trySubmitWord = useCallback((): SubmitResult => {
		if (state.grading) return 'pending'
		const word = state.currentWord.toUpperCase()

		const violation = checkHiveDraft(state)
		if (violation) return violation

		dispatch({ type: 'GRADING', grading: true })
		grade(word).then(
			(result) => {
				if (result.valid) {
					dispatch({ type: 'APPLY_WORD', word, grade: result })
					onSubmitResult?.(result.pangram ? 'pangram' : 'success')
				} else {
					dispatch({ type: 'REJECT_WORD' })
					onSubmitResult?.('not_in_list')
				}
			},
			() => {
				dispatch({ type: 'GRADING', grading: false })
				onSubmitResult?.('grade_failed')
			},
		)
		return 'pending'
	}, [state, grade, onSubmitResult])

	const reset = useCallback((puzzle: WordHivePlayData) => {
		dispatch({ type: 'RESET', puzzle })
	}, [])

	// Handle keyboard input
	useEffect(() => {
		const handleKeyDown = (e: KeyboardEvent) => {
			if (e.ctrlKey || e.metaKey || e.altKey) return
			if (state.gameStatus !== 'playing') return

			if (e.key === 'Enter') {
				e.preventDefault()
				triggerHaptic('submit')
				triggerSound('submit')
				const result = trySubmitWord()
				onSubmitResult?.(result)
			} else if (e.key === 'Backspace') {
				e.preventDefault()
				triggerHaptic('keyPress')
				deleteLetter()
			} else if (e.key === ' ') {
				e.preventDefault()
				shuffle()
			} else if (/^[a-zA-Z]$/.test(e.key)) {
				// Only accept letters that are in the puzzle
				const upperKey = e.key.toUpperCase()
				if (validLettersSet.has(upperKey)) {
					e.preventDefault()
					triggerHaptic('keyPress')
					triggerSound('keyPress')
					addLetter(e.key)
				}
				// Ignore invalid letters silently (no feedback)
			}
		}

		window.addEventListener('keydown', handleKeyDown)
		return () => window.removeEventListener('keydown', handleKeyDown)
	}, [
		addLetter,
		deleteLetter,
		shuffle,
		trySubmitWord,
		onSubmitResult,
		state.gameStatus,
		validLettersSet,
	])

	return {
		...state,
		addLetter,
		deleteLetter,
		shuffle,
		trySubmitWord,
		reset,
		// Found pangrams, for marking them in the found-word list.
		pangrams: state.foundPangrams,
	}
}
