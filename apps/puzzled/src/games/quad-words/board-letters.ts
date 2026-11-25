import type { BoardState, LetterStatus } from './types'

/** One letter's status on each board, in reading order: 1 top-left, 2 top-right, 3 bottom-left, 4 bottom-right. */
export type BoardLetterStatus = readonly [LetterStatus, LetterStatus, LetterStatus, LetterStatus]

export const UNTRIED: BoardLetterStatus = ['empty', 'empty', 'empty', 'empty']

const rank: Record<LetterStatus, number> = { empty: 0, absent: 1, present: 2, correct: 3 }
const codes: Record<LetterStatus, string> = { correct: 'c', present: 'p', absent: 'a', empty: 'e' }

/** The stronger of two statuses: correct > present > absent > empty. */
export function strongerStatus(known: LetterStatus, next: LetterStatus): LetterStatus {
	return rank[next] > rank[known] ? next : known
}

/**
 * What each board has told the player about every letter guessed so far.
 *
 * Derived from the graded rows the boards already hold, so it needs no state of
 * its own. Boards never share a status, a later row never weakens an earlier
 * one, and a solved board keeps the statuses it had when it was solved because
 * it records no further rows.
 */
export function boardLetterStatuses(boards: readonly BoardState[]): Map<string, BoardLetterStatus> {
	const letters = new Map<string, [LetterStatus, LetterStatus, LetterStatus, LetterStatus]>()
	boards.slice(0, 4).forEach((board, index) => {
		board.guesses.forEach((guess, row) => {
			const result = board.results[row]
			if (!result) return
			guess
				.toUpperCase()
				.split('')
				.forEach((letter, col) => {
					const status = result[col]
					if (!status || status === 'empty') return
					let known = letters.get(letter)
					if (!known) {
						known = ['empty', 'empty', 'empty', 'empty']
						letters.set(letter, known)
					}
					known[index] = strongerStatus(known[index] ?? 'empty', status)
				})
		})
	})
	return letters
}

/** `c,p,a,e`: one code per board, for `data-quad-grades`. */
export function gradeCodes(statuses: BoardLetterStatus): string {
	return statuses.map((status) => codes[status]).join(',')
}

/** The one status every board shares, or `undefined` when the boards differ. */
export function sharedStatus(statuses: BoardLetterStatus): LetterStatus | undefined {
	return statuses.every((status) => status === statuses[0]) ? statuses[0] : undefined
}

/** The boards a letter is still in play on (correct or present), by index. */
export function liveBoards(statuses: BoardLetterStatus): number[] {
	return statuses.flatMap((status, index) =>
		status === 'correct' || status === 'present' ? [index] : [],
	)
}
