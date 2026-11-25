import { catalogues } from './catalogues'
import { type Locale, locales } from './config'
import { type GameMessages, mergeGameMessages } from './resolve-messages'

export { type GameCopy, type GameMessages, gameCopyFallbackChain } from './resolve-messages'

/**
 * Module key -> the directory that holds its copy.
 *
 * `crowns` and `duo` are player-facing aliases of `queens` and `tango`, so two
 * keys deliberately share one directory (and one file set).
 */
export const GAME_COPY_SOURCES: Record<string, string> = {
	arithmo: 'arithmo',
	blockSlide: 'block-slide',
	crossword: 'crossword',
	cryptogram: 'cryptogram',
	killerSudoku: 'killer-sudoku',
	nonogram: 'nonogram',
	numberPath: 'number-path',
	patternMatch: 'pattern-match',
	pipPlace: 'pip-place',
	quadWords: 'quad-words',
	queens: 'queens',
	crowns: 'queens',
	sudoku: 'sudoku',
	tango: 'tango',
	duo: 'tango',
	wordBox: 'word-box',
	wordGroups: 'word-groups',
	wordGuess: 'word-guess',
	wordHive: 'word-hive',
	wordLadder: 'word-ladder',
	wordSearch: 'word-search',
}

/** Canonical copy. This object decides which modules the app exposes. */
export const GAME_TRANSLATIONS_EN = catalogues['en-US'].games

export const GAME_TRANSLATIONS_BY_LOCALE: Partial<Record<Locale, GameMessages>> =
	Object.fromEntries(
		locales
			.filter((locale) => locale !== 'en-US' && Object.keys(catalogues[locale].games).length)
			.map((locale) => [locale, catalogues[locale].games]),
	)

export function resolveGameMessages(
	locale: Locale,
	english: GameMessages = GAME_TRANSLATIONS_EN,
	overlays: Partial<Record<Locale, GameMessages>> = GAME_TRANSLATIONS_BY_LOCALE,
): GameMessages {
	return mergeGameMessages(locale, english, overlays)
}
