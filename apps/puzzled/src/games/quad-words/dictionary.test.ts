import { expect, test } from 'bun:test'
import { isValidWord } from '../word-guess/words'

const webWords = Bun.file(new URL('../word-guess/words.ts', import.meta.url))
const serverWords = Bun.file(
	new URL(
		'../../../../../crates/puzzled-core/src/capabilities/puzzle_play/application/grading/quad_words_allowed.txt',
		import.meta.url,
	),
)

test('Quad server and client accept the same words as Word Guess', async () => {
	const [source, server] = await Promise.all([webWords.text(), serverWords.text()])
	const sourceList = source.split('const VALID_WORDS = new Set([')[1].split('])', 1)[0]
	const words = [...new Set(Array.from(sourceList.matchAll(/'([a-z]{5})'/g), (m) => m[1]))].sort()
	expect(words.length).toBeGreaterThan(14_000)
	expect(server.trimEnd()).toBe(words.join('\n'))
	expect(isValidWord('aahEd')).toBe(true)
	expect(isValidWord('ZZZZZ')).toBe(false)
})
