import { WORD_GROUPS_TILE_EMOJI } from '@/features/daily/lib/result-card'
import type { Category } from './types'

/** The draft's guess key: the guessed words, sorted, as JSON. */
function guessKey(words: readonly string[]): string {
	return JSON.stringify([...words].sort())
}

/**
 * Quartet's share grid: one row per server-graded guess, in order. A found
 * group is four squares of its band colour; any other guess is four dark
 * squares. A miss never says which bands its words belong to, and groups the
 * player never found (the loss reveal) never appear, so the grid carries no
 * word, group name or unopened content. Empty when the guess log is unknown
 * (an older or restored result), so the share falls back to the text result.
 */
export function wordGroupsSharePattern(
	guesses: Iterable<string>,
	solved: readonly Category[],
): string {
	const levels = new Map(solved.map((category) => [guessKey(category.words), category.level]))
	const rows: string[] = []
	for (const guess of guesses) {
		const level = levels.get(guess)
		const square = WORD_GROUPS_TILE_EMOJI[level === undefined ? 'miss' : (`group${level}` as const)]
		rows.push(square.repeat(4))
	}
	const found = new Set(rows.filter((row) => !row.startsWith(WORD_GROUPS_TILE_EMOJI.miss)))
	// Every found group must come from the logged guesses, or the log is incomplete.
	return found.size === solved.length ? rows.join('\n') : ''
}
