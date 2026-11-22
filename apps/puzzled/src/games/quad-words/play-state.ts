import {
	allBoardsSolved,
	type BoardState,
	type GuessResult,
	getBestStatus,
	type LetterStatus,
	MAX_GUESSES,
	type QuordleGameState,
} from './types'

type QuordleAction =
	| { type: 'ADD_LETTER'; letter: string }
	| { type: 'DELETE_LETTER' }
	| { type: 'GRADING'; grading: boolean }
	| {
			type: 'APPLY_GUESS'
			guess: string
			results: [GuessResult, GuessResult, GuessResult, GuessResult]
	  }
	| { type: 'RESET' }

function emptyBoard(): BoardState {
	return { guesses: [], results: [], solved: false, solvedOnGuess: null }
}

export function createInitialState(): QuordleGameState {
	return {
		grading: false,
		boards: [emptyBoard(), emptyBoard(), emptyBoard(), emptyBoard()],
		currentGuess: '',
		guessHistory: [],
		gameStatus: 'playing',
		startTime: null,
		endTime: null,
		keyboardStatus: new Map(),
	}
}

function updateKeyboardStatus(
	current: Map<string, LetterStatus>,
	guess: string,
	results: GuessResult[],
): Map<string, LetterStatus> {
	const newMap = new Map(current)
	const letters = guess.toUpperCase().split('')

	letters.forEach((letter, i) => {
		// Get status from all boards for this letter position
		const statuses = results.map((r) => r[i])
		const bestStatus = getBestStatus(statuses)

		// Only upgrade status, never downgrade
		const existing = newMap.get(letter)
		if (!existing) {
			newMap.set(letter, bestStatus)
		} else if (bestStatus === 'correct') {
			newMap.set(letter, 'correct')
		} else if (bestStatus === 'present' && existing !== 'correct') {
			newMap.set(letter, 'present')
		}
	})

	return newMap
}

export function quordleReducer(state: QuordleGameState, action: QuordleAction): QuordleGameState {
	switch (action.type) {
		case 'ADD_LETTER': {
			if (state.gameStatus !== 'playing' || state.grading) return state
			if (state.currentGuess.length >= 5) return state

			return {
				...state,
				currentGuess: state.currentGuess + action.letter.toUpperCase(),
				startTime: state.startTime ?? Date.now(),
			}
		}

		case 'DELETE_LETTER': {
			if (state.gameStatus !== 'playing' || state.grading) return state
			if (state.currentGuess.length === 0) return state

			return {
				...state,
				currentGuess: state.currentGuess.slice(0, -1),
			}
		}

		case 'GRADING': {
			return { ...state, grading: action.grading }
		}

		case 'APPLY_GUESS': {
			if (state.gameStatus !== 'playing') return state

			const guess = action.guess.toUpperCase()
			const guessNumber = state.guessHistory.length + 1
			const { results } = action

			// Update boards; a solved board keeps its last result.
			const newBoards = state.boards.map((board, i) => {
				if (board.solved) return board

				const result = results[i]
				const isCorrect = result.length === 5 && result.every((s) => s === 'correct')

				return {
					...board,
					guesses: [...board.guesses, guess],
					results: [...board.results, result],
					solved: isCorrect,
					solvedOnGuess: isCorrect ? guessNumber : null,
				}
			}) as [BoardState, BoardState, BoardState, BoardState]

			// Update keyboard (every board's grading, as before)
			const newKeyboardStatus = updateKeyboardStatus(state.keyboardStatus, guess, results)

			// Check game end
			const allSolved = allBoardsSolved(newBoards)
			const outOfGuesses = guessNumber >= MAX_GUESSES

			let gameStatus: 'playing' | 'won' | 'lost' = 'playing'
			if (allSolved) {
				gameStatus = 'won'
			} else if (outOfGuesses) {
				gameStatus = 'lost'
			}

			return {
				...state,
				grading: false,
				boards: newBoards,
				currentGuess: '',
				guessHistory: [...state.guessHistory, guess],
				gameStatus,
				endTime: gameStatus !== 'playing' ? Date.now() : null,
				keyboardStatus: newKeyboardStatus,
			}
		}

		case 'RESET': {
			return createInitialState()
		}

		default:
			return state
	}
}
