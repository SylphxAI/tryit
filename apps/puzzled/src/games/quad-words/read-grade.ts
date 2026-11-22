import type { GuessResult } from './types'

export function readQuadGrade(
	value: unknown,
): [GuessResult, GuessResult, GuessResult, GuessResult] | null {
	if (!value || typeof value !== 'object' || !('boards' in value) || !Array.isArray(value.boards)) {
		return null
	}
	const [a, b, c, d] = value.boards
	return value.boards.length === 4 &&
		isBoardGrade(a) &&
		isBoardGrade(b) &&
		isBoardGrade(c) &&
		isBoardGrade(d)
		? [a, b, c, d]
		: null
}

function isBoardGrade(value: unknown): value is GuessResult {
	return (
		Array.isArray(value) &&
		value.length === 5 &&
		value.every((tile) => tile === 'correct' || tile === 'present' || tile === 'absent')
	)
}
