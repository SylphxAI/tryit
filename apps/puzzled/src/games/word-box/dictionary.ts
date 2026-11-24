import dictionaryUrl from './word-list.txt?url'

let dictionary: Promise<Set<string>> | undefined

export async function isFrameWord(word: string): Promise<boolean> {
	// Fetch only for Frame, and keep a successful word list for subsequent puzzles.
	dictionary ??= fetch(dictionaryUrl)
		.then(async (response) => {
			if (!response.ok) throw new Error('Frame dictionary unavailable')
			return new Set((await response.text()).trimEnd().split(/\r?\n/))
		})
		.catch((cause) => {
			dictionary = undefined
			throw cause
		})
	return (await dictionary).has(word.toUpperCase())
}
