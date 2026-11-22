import { type CharStatus, EQUATION_LENGTH } from './types'

type GradedTile = Exclude<CharStatus, 'empty'>

function isGradedTile(tile: unknown): tile is GradedTile {
	return tile === 'correct' || tile === 'present' || tile === 'absent'
}

/** Consume feedback only, never any solution fields. A malformed reply costs no local row. */
export function parseGrade(reply: unknown): GradedTile[] | null {
	if (!reply || typeof reply !== 'object' || !('tiles' in reply)) return null
	const { tiles } = reply
	if (!Array.isArray(tiles) || tiles.length !== EQUATION_LENGTH) return null
	const result = Array.from(tiles)
	return result.every(isGradedTile) ? result : null
}

export function parseArithmoClientPayload(payload: unknown): { length: number } | null {
	if (!payload || typeof payload !== 'object') return null
	const data = 'puzzleData' in payload ? payload.puzzleData : payload
	return data && typeof data === 'object' && 'length' in data && data.length === EQUATION_LENGTH
		? { length: data.length }
		: null
}

const rank: Record<CharStatus, number> = { empty: 0, absent: 1, present: 2, correct: 3 }

export function updateKeyboardStatus(
	previous: Record<string, CharStatus>,
	guess: string,
	tiles: readonly CharStatus[],
): Record<string, CharStatus> {
	const next = { ...previous }
	for (let index = 0; index < guess.length; index++) {
		const char = guess[index]
		const tile = tiles[index]
		if (rank[tile] > rank[next[char] ?? 'empty']) next[char] = tile
	}
	return next
}
