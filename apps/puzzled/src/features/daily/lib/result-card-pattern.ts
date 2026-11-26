/**
 * One cell of the shareable pattern. Content-free by construction: a tile says
 * hit, near or miss and can never carry a letter, digit or word.
 */
export type ResultCardTile = 'hit' | 'near' | 'miss'

/** Five's share squares use the same colours on screen and in the PNG. */
export const FIVE_RESULT_TILE_COLORS: Readonly<Record<ResultCardTile, string>> = {
	hit: '#8b55c5',
	near: '#ed9a42',
	miss: '#403d4c',
}

/** Pattern bounds, so a card can never become an answer-grid dump. */
export const RESULT_CARD_PATTERN_MAX_ROWS = 12
export const RESULT_CARD_PATTERN_MAX_COLS = 12

const EMOJI_TILE: Readonly<Record<string, ResultCardTile>> = {
	'🟩': 'hit',
	'🟪': 'hit',
	'🟨': 'near',
	'🟧': 'near',
	'⬛': 'miss',
	'⬜': 'miss',
}

/** Accept only a grid of spoiler-free squares, never letters or other text. */
export function parseResultPattern(text?: string): ResultCardTile[][] | null {
	if (!text?.trim()) return null
	const rows: ResultCardTile[][] = []
	for (const line of text.trim().split('\n')) {
		const row: ResultCardTile[] = []
		for (const cell of line.trim()) {
			const tile = EMOJI_TILE[cell]
			if (!tile) return null
			row.push(tile)
		}
		if (!row.length) return null
		rows.push(row)
	}
	return normalizePattern(rows)
}

const TILE_VALUES: readonly string[] = ['hit', 'near', 'miss']

export function normalizePattern(
	pattern: readonly (readonly ResultCardTile[])[] | null | undefined,
): ResultCardTile[][] | null {
	if (!pattern || pattern.length === 0) return null
	const rows: ResultCardTile[][] = []
	for (const row of pattern.slice(0, RESULT_CARD_PATTERN_MAX_ROWS)) {
		if (!Array.isArray(row)) continue
		const cells: ResultCardTile[] = []
		for (const cell of row.slice(0, RESULT_CARD_PATTERN_MAX_COLS)) {
			cells.push(TILE_VALUES.includes(cell as string) ? (cell as ResultCardTile) : 'miss')
		}
		if (cells.length > 0) rows.push(cells)
	}
	return rows.length > 0 ? rows : null
}
