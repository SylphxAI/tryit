import { expect, test } from 'bun:test'

const websiteWords = Bun.file(new URL('./word-list.txt', import.meta.url))
const generatorWords = Bun.file(
	new URL(
		'../../../../../crates/puzzled-core/src/capabilities/puzzle_play/generate/data/word_box_words.txt',
		import.meta.url,
	),
)

test('Frame ships the entire generator dictionary unchanged', async () => {
	const [client, server] = await Promise.all([websiteWords.text(), generatorWords.text()])
	expect(Bun.hash(client)).toBe(Bun.hash(server))
})
