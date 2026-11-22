import {
	calculateWordScore,
	getRankForScore,
	MIN_WORD_LENGTH,
	type SpellingBeeState,
	type WordHiveGrade,
	type WordHivePlayData,
} from './types'

type SpellingBeeAction =
	| { type: 'ADD_LETTER'; letter: string }
	| { type: 'DELETE_LETTER' }
	| { type: 'GRADING'; grading: boolean }
	| { type: 'REJECT_WORD' }
	| { type: 'APPLY_WORD'; word: string; grade: WordHiveGrade }
	| { type: 'SHUFFLE' }
	| { type: 'RESET'; puzzle: WordHivePlayData }

export type SubmitResult =
	| 'success'
	| 'pangram'
	| 'too_short'
	| 'missing_center'
	| 'invalid_letter'
	| 'not_in_list'
	| 'already_found'
	| 'grade_failed'
	| 'pending'

// ==========================================
// Reducer
// ==========================================

export function spellingBeeReducer(
	state: SpellingBeeState,
	action: SpellingBeeAction,
): SpellingBeeState {
	switch (action.type) {
		case 'ADD_LETTER': {
			if (state.gameStatus !== 'playing' || state.grading) return state
			return {
				...state,
				currentWord: state.currentWord + action.letter.toUpperCase(),
			}
		}

		case 'DELETE_LETTER': {
			if (state.gameStatus !== 'playing' || state.grading) return state
			if (state.currentWord.length === 0) return state
			return {
				...state,
				currentWord: state.currentWord.slice(0, -1),
			}
		}

		case 'GRADING': {
			return { ...state, grading: action.grading }
		}

		case 'REJECT_WORD': {
			// Graded as not in the list: keep the letters so the player can edit.
			return { ...state, grading: false }
		}

		case 'APPLY_WORD': {
			if (state.gameStatus !== 'playing') return state
			if (!action.grade.valid) return { ...state, grading: false }
			const word = action.word.toUpperCase()
			if (state.foundWords.includes(word)) return { ...state, grading: false }

			const { grade } = action
			const wordScore = calculateWordScore(word, grade.pangram)
			const newScore = state.score + wordScore
			const newFoundWords = [...state.foundWords, word]
			const totalWords = grade.totalWords || state.totalWords

			// Every word found (Queen Bee!)
			const isComplete = totalWords > 0 && newFoundWords.length >= totalWords

			return {
				...state,
				grading: false,
				foundWords: newFoundWords,
				foundPangrams: grade.pangram ? [...state.foundPangrams, word] : state.foundPangrams,
				score: newScore,
				currentWord: '',
				rank: getRankForScore(newScore, state.maxScore),
				totalWords,
				totalPangrams: grade.totalPangrams || state.totalPangrams,
				gameStatus: isComplete ? 'won' : 'playing',
			}
		}

		case 'SHUFFLE': {
			// Randomly shuffle outer letters
			const shuffled = [...state.outerLetters].sort(() => Math.random() - 0.5)
			return {
				...state,
				outerLetters: shuffled,
			}
		}

		case 'RESET': {
			return createInitialState(action.puzzle)
		}

		default:
			return state
	}
}

export function createInitialState(puzzle: WordHivePlayData): SpellingBeeState {
	return {
		grading: false,
		centerLetter: puzzle.centerLetter,
		outerLetters: puzzle.outerLetters,
		currentWord: '',
		foundWords: [],
		foundPangrams: [],
		score: 0,
		maxScore: puzzle.maxScore,
		totalWords: puzzle.totalWords,
		totalPangrams: puzzle.totalPangrams,
		gameStatus: 'playing',
		rank: 'beginner',
	}
}

/** Reject rule violations only; dictionary membership comes from CheckGuess. */
export function checkHiveDraft(
	state: SpellingBeeState,
): 'too_short' | 'missing_center' | 'invalid_letter' | 'already_found' | undefined {
	const word = state.currentWord.toUpperCase()
	if (word.length < MIN_WORD_LENGTH) return 'too_short'
	if (!word.includes(state.centerLetter)) return 'missing_center'
	const letters = [state.centerLetter, ...state.outerLetters]
	if ([...word].some((letter) => !letters.includes(letter))) return 'invalid_letter'
	if (state.foundWords.includes(word)) return 'already_found'
}
