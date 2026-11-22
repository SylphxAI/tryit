import type { CryptogramGameState, CryptogramPuzzleData, PlayerGuesses } from './types'
import { getUniqueLetters } from './types'

export type CryptogramAction =
	| { type: 'SET_GUESS'; encryptedLetter: string; guessedLetter: string }
	| { type: 'CLEAR_GUESS'; encryptedLetter: string }
	| { type: 'REVEAL'; encryptedLetter: string; letter: string }
	| { type: 'CHECKED'; solved: boolean; guesses: PlayerGuesses }
	| { type: 'SELECT_LETTER'; encryptedLetter: string | null }
	| { type: 'RESET' }

export type CryptogramClientState = CryptogramGameState & {
	/** Every letter is filled and the server said the decoding is not right. */
	lastCheckWrong: boolean
}

export function createCryptogramState(puzzleData: CryptogramPuzzleData): CryptogramClientState {
	const guesses: PlayerGuesses = {}
	for (const letter of getUniqueLetters(puzzleData.encryptedText)) {
		guesses[letter] = ''
	}
	return {
		guesses,
		selectedLetter: null,
		hintsUsed: 0,
		revealedLetters: [],
		gameStatus: 'playing',
		startTime: null,
		endTime: null,
		lastCheckWrong: false,
	}
}

export function isFullyFilled(guesses: PlayerGuesses): boolean {
	const values = Object.values(guesses)
	return values.length > 0 && values.every((value) => value !== '')
}

export function cryptogramReducer(
	state: CryptogramClientState,
	action: CryptogramAction,
	puzzleData: CryptogramPuzzleData,
): CryptogramClientState {
	switch (action.type) {
		case 'SET_GUESS': {
			if (state.gameStatus !== 'playing') return state
			const encrypted = action.encryptedLetter.toUpperCase()
			const guessed = action.guessedLetter.toUpperCase()
			// Don't allow changing revealed letters
			if (!(encrypted in state.guesses) || state.revealedLetters.includes(encrypted)) return state

			if (!/^[A-Z]$/.test(guessed)) return state
			if (state.revealedLetters.some((key) => state.guesses[key] === guessed)) return state

			// A decryption letter can map from only one encrypted letter.
			const conflict = Object.entries(state.guesses).find(
				([key, val]) =>
					val === guessed && key !== encrypted && !state.revealedLetters.includes(key),
			)
			const guesses = { ...state.guesses }
			if (conflict) guesses[conflict[0]] = ''
			guesses[encrypted] = guessed
			return {
				...state,
				guesses,
				startTime: state.startTime ?? Date.now(),
				lastCheckWrong: false,
			}
		}

		case 'CLEAR_GUESS': {
			if (state.gameStatus !== 'playing') return state
			const encrypted = action.encryptedLetter.toUpperCase()
			if (state.revealedLetters.includes(encrypted)) return state
			return {
				...state,
				guesses: { ...state.guesses, [encrypted]: '' },
				lastCheckWrong: false,
			}
		}

		case 'REVEAL': {
			if (state.gameStatus !== 'playing' || state.hintsUsed >= puzzleData.maxHints) return state
			const encrypted = action.encryptedLetter.toUpperCase()
			const letter = action.letter.toUpperCase()
			if (!(encrypted in state.guesses) || state.revealedLetters.includes(encrypted)) return state
			if (!/^[A-Z]$/.test(letter)) return state
			const guesses = { ...state.guesses }
			// The revealed letter can no longer stand for another encrypted letter.
			for (const [key, val] of Object.entries(guesses)) {
				if (val === letter && key !== encrypted) guesses[key] = ''
			}
			guesses[encrypted] = letter
			return {
				...state,
				guesses,
				revealedLetters: [...state.revealedLetters, encrypted],
				hintsUsed: state.hintsUsed + 1,
				startTime: state.startTime ?? Date.now(),
				lastCheckWrong: false,
			}
		}

		case 'CHECKED': {
			if (state.gameStatus !== 'playing') return state
			// A result for guesses the player has since changed is stale.
			if (JSON.stringify(action.guesses) !== JSON.stringify(state.guesses)) return state
			return action.solved
				? { ...state, gameStatus: 'won', endTime: Date.now(), lastCheckWrong: false }
				: { ...state, lastCheckWrong: true }
		}

		case 'SELECT_LETTER':
			if (action.encryptedLetter !== null && !(action.encryptedLetter in state.guesses))
				return state
			return { ...state, selectedLetter: action.encryptedLetter }

		case 'RESET':
			return createCryptogramState(puzzleData)

		default:
			return state
	}
}
