/** Squares per row, and the most rows the shared result-card codec keeps. */
const ROW_CELLS = 10
const MAX_ROWS = 12

const WORD = '🟩'
const PANGRAM = '🟨'

/**
 * Hive's share grid: one square per word the server accepted, in the order
 * found, ten to a row; a pangram is yellow, any other word green. It never
 * carries a letter, word length or score, so the grid says only how many
 * words and pangrams the player found, which the result already shows.
 * Empty (the share falls back to the text result) when the run is unknown,
 * a pangram is not among the found words, or the run is too long for the card.
 */
export function wordHiveSharePattern(
	foundWords: readonly string[],
	foundPangrams: readonly string[],
): string {
	const pangrams = new Set(foundPangrams)
	if (foundWords.length === 0 || foundWords.length > ROW_CELLS * MAX_ROWS) return ''
	if ([...pangrams].some((word) => !foundWords.includes(word))) return ''
	const rows: string[] = []
	for (let start = 0; start < foundWords.length; start += ROW_CELLS) {
		rows.push(
			foundWords
				.slice(start, start + ROW_CELLS)
				.map((word) => (pangrams.has(word) ? PANGRAM : WORD))
				.join(''),
		)
	}
	return rows.join('\n')
}
