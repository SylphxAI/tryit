import { Code, ConnectError } from '@connectrpc/connect'
import type { PuzzleDifficulty } from '@/games/types'

/** Mirrors puzzled-core's practice allowlist. The server still admits every request. */
export const PRACTICE_GAMES = [
	'sudoku',
	'word-guess',
	'quad-words',
	'crowns',
	'nonogram',
	'pattern-match',
	'killer-sudoku',
	'duo',
	'arithmo',
	'block-slide',
	'pip-place',
	'number-path',
] as const

export function isPracticeSupported(slug: string): slug is (typeof PRACTICE_GAMES)[number] {
	return PRACTICE_GAMES.some((game) => game === slug)
}

export const PRACTICE_UPSELL = 'practice_upsell'

export function practicePath(gamePath: string, difficulty?: PuzzleDifficulty) {
	const search = new URLSearchParams({ mode: 'practice' })
	if (difficulty) search.set('difficulty', difficulty)
	return `${gamePath}?${search.toString()}#play`
}

export function practiceRefusal(error: unknown): 'guest' | 'free' | undefined {
	const { code, rawMessage } = ConnectError.from(error)
	if (code === Code.Unauthenticated) return 'guest'
	if (code === Code.PermissionDenied && rawMessage === 'plus_required_for_practice') return 'free'
}
