const englishWordPuzzles = new Set([
	'word-guess',
	'quad-words',
	'word-ladder',
	'word-groups',
	'word-search',
	'cryptogram',
	'word-box',
	'word-hive',
	'crossword',
])

export function needsEnglishWordNotice(locale: string, slug: string): boolean {
	return !locale.startsWith('en-') && englishWordPuzzles.has(slug)
}
