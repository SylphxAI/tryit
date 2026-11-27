/**
 * One cell of the shareable pattern. Content-free by construction: a tile says
 * hit, near or miss and can never carry a letter, digit or word.
 */
export type ResultCardTile = 'hit' | 'near' | 'miss' | WordGroupsTile

/** Quartet's group bands by difficulty level (0 easiest); colour only, never a word. */
export type WordGroupsTile = 'group0' | 'group1' | 'group2' | 'group3'

/** Five's share squares use the same colours on screen and in the PNG. */
export const FIVE_RESULT_TILE_COLORS: Readonly<Record<'hit' | 'near' | 'miss', string>> = {
	hit: '#8b55c5',
	near: '#ed9a42',
	miss: '#403d4c',
}

/** Quartet's band colours (word-groups CATEGORY_COLORS) for the PNG. */
export const WORD_GROUPS_RESULT_TILE_COLORS: Readonly<Record<WordGroupsTile, string>> = {
	group0: '#efa0bb',
	group1: '#72d3c4',
	group2: '#a9a4ee',
	group3: '#d8ad61',
}

/** A fixed tile colour (Five's squares, Quartet's bands), or undefined for the theme's own. */
export function resultTileFixedColor(gameSlug: string, tile: ResultCardTile): string | undefined {
	if (tile !== 'hit' && tile !== 'near' && tile !== 'miss')
		return WORD_GROUPS_RESULT_TILE_COLORS[tile]
	return gameSlug === 'word-guess' ? FIVE_RESULT_TILE_COLORS[tile] : undefined
}

/** Quartet share squares, one per band; a missed guess is a dark row. */
export const WORD_GROUPS_TILE_EMOJI: Readonly<Record<WordGroupsTile | 'miss', string>> = {
	group0: '🟥',
	group1: '🟩',
	group2: '🟦',
	group3: '🟨',
	miss: '⬛',
}

/** A Quartet run is at most four found groups plus three misses, or four misses plus three. */
export const WORD_GROUPS_PATTERN_MAX_ROWS = 7
const WORD_GROUPS_ROW_CELLS = 4

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

const WORD_GROUPS_EMOJI_TILE: Readonly<Record<string, ResultCardTile>> = Object.fromEntries(
	Object.entries(WORD_GROUPS_TILE_EMOJI).map(([tile, emoji]) => [emoji, tile as ResultCardTile]),
)

/**
 * Quartet rows are one guess each: four squares of one band, or four misses.
 * Anything else (mixed rows, other glyphs, too many rows) is not a Quartet grid.
 */
function parseWordGroupsPattern(text: string): ResultCardTile[][] | null {
	const lines = text.trim().split('\n')
	if (lines.length > WORD_GROUPS_PATTERN_MAX_ROWS) return null
	const rows: ResultCardTile[][] = []
	for (const line of lines) {
		const cells = [...line.trim()]
		const tile = WORD_GROUPS_EMOJI_TILE[cells[0] ?? '']
		if (!tile || cells.length !== WORD_GROUPS_ROW_CELLS || cells.some((c) => c !== cells[0])) {
			return null
		}
		rows.push(cells.map(() => tile))
	}
	return rows
}

/**
 * Accept only a grid of spoiler-free squares, never letters or other text.
 * Quartet (word-groups) uses its own band colours, so it parses with its own codec.
 */
export function parseResultPattern(text?: string, gameSlug?: string): ResultCardTile[][] | null {
	if (!text?.trim()) return null
	if (gameSlug === 'word-groups') return parseWordGroupsPattern(text)
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

const TILE_VALUES: readonly string[] = [
	'hit',
	'near',
	'miss',
	'group0',
	'group1',
	'group2',
	'group3',
]

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
