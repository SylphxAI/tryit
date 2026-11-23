import { expect, test } from 'bun:test'
import { locales } from '@/lib/i18n/config'
import { createTranslator } from '@/lib/i18n/translate'
import { parseGameFaq } from './game-page'

const en = createTranslator('en-US')
const games = Object.keys(en.raw('catalog.game') as Record<string, unknown>)

for (const locale of locales.filter((locale) => !locale.startsWith('en-'))) {
	test(locale + ' does not fall back to English in game FAQs', () => {
		const t = createTranslator(locale)
		for (const game of games) {
			const key = 'catalog.game.' + game + '.faq'
			const english = parseGameFaq(en.raw(key))
			const translated = parseGameFaq(t.raw(key))
			expect(translated.length, game).toBe(english.length)
			for (const [index, { question, answer }] of translated.entries()) {
				expect(question, game).not.toBe(english[index].question)
				expect(answer, game).not.toBe(english[index].answer)
			}
		}
	})
}
