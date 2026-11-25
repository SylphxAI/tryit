import { describe, expect, test } from 'bun:test'
import {
	boardLetterStatuses,
	gradeCodes,
	liveBoards,
	sharedStatus,
	strongerStatus,
	UNTRIED,
} from './board-letters'
import { createInitialState, quordleReducer } from './play-state'
import type { GuessResult, LetterStatus, QuordleGameState } from './types'

type Grades = [GuessResult, GuessResult, GuessResult, GuessResult]

/** `c` correct, `p` present, `a` absent, one character per letter. */
function row(pattern: string): GuessResult {
	const statuses: Record<string, LetterStatus> = { c: 'correct', p: 'present', a: 'absent' }
	return pattern.split('').map((code) => statuses[code] ?? 'empty')
}

function play(state: QuordleGameState, guess: string, patterns: string[]): QuordleGameState {
	return quordleReducer(state, {
		type: 'APPLY_GUESS',
		guess,
		results: patterns.map(row) as Grades,
	})
}

describe('quad-words per-board letter status', () => {
	test('a letter nobody has guessed is untried on every board', () => {
		const letters = boardLetterStatuses(createInitialState().boards)
		expect(letters.size).toBe(0)
		expect(letters.get('A') ?? UNTRIED).toEqual(['empty', 'empty', 'empty', 'empty'])
		expect(gradeCodes(UNTRIED)).toBe('e,e,e,e')
	})

	test('typing an ungraded guess changes nothing', () => {
		const typed = quordleReducer(createInitialState(), { type: 'ADD_LETTER', letter: 'c' })
		expect(boardLetterStatuses(typed.boards).size).toBe(0)
	})

	test('each board grades the same letter on its own', () => {
		const state = play(createInitialState(), 'crane', ['caaaa', 'paaaa', 'aaaaa', 'aapaa'])
		const letters = boardLetterStatuses(state.boards)
		expect(letters.get('C')).toEqual(['correct', 'present', 'absent', 'absent'])
		expect(letters.get('A')).toEqual(['absent', 'absent', 'absent', 'present'])
		expect(letters.get('E')).toEqual(['absent', 'absent', 'absent', 'absent'])
		expect(letters.has('Z')).toBe(false)
		expect(gradeCodes(letters.get('C') ?? UNTRIED)).toBe('c,p,a,a')
	})

	test('a board upgrades without touching the other three', () => {
		const first = play(createInitialState(), 'crane', ['paaaa', 'aaaaa', 'aaaaa', 'aaaaa'])
		const second = play(first, 'ascot', ['aacaa', 'aaaaa', 'aapaa', 'aaaaa'])
		const letters = boardLetterStatuses(second.boards)
		expect(letters.get('C')).toEqual(['correct', 'absent', 'present', 'absent'])
	})

	test('a later, weaker grade never downgrades a board', () => {
		const first = play(createInitialState(), 'crane', ['caaaa', 'paaaa', 'aaaaa', 'aaaaa'])
		const second = play(first, 'ascot', ['aapaa', 'aaaaa', 'aaaaa', 'aaaaa'])
		const letters = boardLetterStatuses(second.boards)
		expect(letters.get('C')).toEqual(['correct', 'present', 'absent', 'absent'])
	})

	test('a repeated letter in one guess keeps its strongest grade per board', () => {
		const state = play(createInitialState(), 'llama', ['acaaa', 'paaaa', 'aaaaa', 'apaaa'])
		const letters = boardLetterStatuses(state.boards)
		expect(letters.get('L')).toEqual(['correct', 'present', 'absent', 'present'])
		expect(letters.get('A')).toEqual(['absent', 'absent', 'absent', 'absent'])
	})

	test('a solved board keeps its final statuses and ignores later guesses', () => {
		const first = play(createInitialState(), 'crane', ['aaaaa', 'aaaaa', 'paaaa', 'aaaaa'])
		const solved = play(first, 'punch', ['aaaaa', 'aaaaa', 'ccccc', 'aaaaa'])
		expect(solved.boards[2].solved).toBe(true)
		const later = play(solved, 'logic', ['paaaa', 'acaaa', 'aaaac', 'aaaap'])
		const letters = boardLetterStatuses(later.boards)
		// Board 3 was solved by PUNCH: its C stays correct and LOGIC never reaches it.
		expect(letters.get('C')).toEqual(['absent', 'absent', 'correct', 'present'])
		expect(letters.get('P')).toEqual(['absent', 'absent', 'correct', 'absent'])
		expect(letters.get('L')).toEqual(['present', 'absent', 'empty', 'absent'])
		expect(letters.get('O')).toEqual(['absent', 'correct', 'empty', 'absent'])
		expect(gradeCodes(letters.get('L') ?? UNTRIED)).toBe('p,a,e,a')
	})

	test('the best overall status stays available for existing callers', () => {
		const state = play(createInitialState(), 'crane', ['caaaa', 'paaaa', 'aaaaa', 'aaaaa'])
		expect(state.keyboardStatus.get('C')).toBe('correct')
		expect(state.keyboardStatus.get('E')).toBe('absent')
	})

	test('status priority is correct, then present, then absent, then empty', () => {
		expect(strongerStatus('empty', 'absent')).toBe('absent')
		expect(strongerStatus('absent', 'present')).toBe('present')
		expect(strongerStatus('present', 'correct')).toBe('correct')
		expect(strongerStatus('correct', 'present')).toBe('correct')
		expect(strongerStatus('present', 'absent')).toBe('present')
		expect(strongerStatus('absent', 'empty')).toBe('absent')
	})

	test('a status every board shares collapses to one, mixed boards do not', () => {
		expect(sharedStatus(['absent', 'absent', 'absent', 'absent'])).toBe('absent')
		expect(sharedStatus(UNTRIED)).toBe('empty')
		expect(sharedStatus(['correct', 'absent', 'absent', 'absent'])).toBeUndefined()
	})

	test('a letter is live only on the boards that have it', () => {
		expect(liveBoards(['absent', 'present', 'correct', 'empty'])).toEqual([1, 2])
		expect(liveBoards(['absent', 'absent', 'empty', 'absent'])).toEqual([])
		expect(liveBoards(UNTRIED)).toEqual([])
	})

	test('rows without a grade and extra boards are ignored', () => {
		const board = { guesses: ['CRANE'], results: [], solved: false, solvedOnGuess: null }
		const graded = { ...board, results: [row('caaaa')] }
		expect(boardLetterStatuses([board, board, board, board]).size).toBe(0)
		const letters = boardLetterStatuses([board, board, board, board, graded])
		expect(letters.size).toBe(0)
	})
})
