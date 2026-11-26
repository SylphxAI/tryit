import { type Category, TOTAL_CATEGORIES, WORDS_PER_CATEGORY } from './types'

/**
 * Client parser for GetDaily word-groups payloads.
 *
 * The server serves the sixteen words only (`{ words, maxMistakes,
 * wordsPerCategory, totalCategories }`); the groups stay on the server, which
 * grades each guess (`PuzzleService.CheckGuess`). The legacy wrapped
 * `{ puzzleData, solution }` shape is accepted and its solution dropped.
 */

function isRecord(value: unknown): value is Record<string, unknown> {
	return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

/** The sixteen words to group. */
export function parseWordGroupsClientPayload(data: unknown): string[] {
	if (!isRecord(data)) throw new Error('[word-groups] invalid puzzle payload')
	const inner = isRecord(data.puzzleData) ? data.puzzleData : data
	const { words } = inner
	if (!Array.isArray(words) || words.length !== 16 || !words.every((w) => typeof w === 'string')) {
		throw new Error('[word-groups] the served puzzle needs sixteen words')
	}
	return words
}

function isCategory(value: unknown): value is Category {
	return (
		isRecord(value) &&
		typeof value.name === 'string' &&
		value.name.length > 0 &&
		(value.level === 0 || value.level === 1 || value.level === 2 || value.level === 3) &&
		Array.isArray(value.words) &&
		value.words.length === WORDS_PER_CATEGORY &&
		value.words.every((word) => typeof word === 'string') &&
		new Set(value.words).size === WORDS_PER_CATEGORY
	)
}

export function parseGrade(value: unknown, guess: string[], solved: Category[]) {
	if (!isRecord(value) || typeof value.oneAway !== 'boolean') throw new Error('invalid_group_grade')
	if (value.correct === false) return { oneAway: value.oneAway }
	const { category } = value
	if (
		value.correct !== true ||
		!isCategory(category) ||
		solved.some((cat) => cat.name === category.name) ||
		!category.words.every((word) => guess.includes(word))
	)
		throw new Error('invalid_group_grade')
	return { category, oneAway: false }
}

export function parseReveal(json: string | undefined): Category[] {
	if (!json) return []
	try {
		const data: unknown = JSON.parse(json)
		if (
			isRecord(data) &&
			Array.isArray(data.categories) &&
			data.categories.length === TOTAL_CATEGORIES &&
			data.categories.every(isCategory)
		)
			return data.categories
	} catch {
		// The accepted result remains usable even without its optional reveal.
	}
	return []
}
