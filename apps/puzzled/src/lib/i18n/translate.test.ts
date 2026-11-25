import { describe, expect, test } from 'bun:test'
import { IntlMessageFormat } from 'intl-messageformat'
import { locales } from './config'
import { loadMessages } from './messages'
import { createTranslator } from './translate'

describe('ICU translations', () => {
	test('interpolates locale copy and resolves fallback namespaces', () => {
		const t = createTranslator('en-GB')
		expect(t('catalog.showing', { count: 4, total: 19 })).toBe('Showing 4 of 19 games')
		expect(t('nav.games')).toBe('Games')
	})

	test('reuses the locale catalogue and keeps literal and ICU output identical', () => {
		for (const locale of locales) {
			const t = createTranslator(locale)
			expect(createTranslator(locale)).toBe(t)
			expect(loadMessages(locale)).toBe(loadMessages(locale))
			for (const [key, values] of [
				['nav.games', {}],
				['common.cellRow', { index: 10 }],
				['catalog.showing', { count: 4, total: 19 }],
			] as const) {
				const raw = t.raw(key)
				if (typeof raw !== 'string') throw new Error(key)
				expect(t(key, values)).toBe(String(new IntlMessageFormat(raw, locale).format(values)))
			}
		}
	})

	test('reads only string keys owned by the message catalogue', () => {
		const t = createTranslator('en-US')
		expect(t.has('catalog.faq')).toBe(false)
		expect(t.has('catalog.__proto__.toString')).toBe(false)
		expect(t('untranslated.key')).toBe('untranslated.key')
	})
})
