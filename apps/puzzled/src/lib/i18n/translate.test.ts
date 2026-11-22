import { describe, expect, test } from 'bun:test'
import { createTranslator } from './translate'

describe('ICU translations', () => {
	test('interpolates locale copy and resolves fallback namespaces', () => {
		const t = createTranslator('en-GB')
		expect(t('catalog.showing', { count: 4, total: 19 })).toBe('Showing 4 of 19 games')
		expect(t('nav.games')).toBe('Games')
	})

	test('reads only string keys owned by the message catalogue', () => {
		const t = createTranslator('en-US')
		expect(t.has('catalog.faq')).toBe(false)
		expect(t.has('catalog.__proto__.toString')).toBe(false)
		expect(t('untranslated.key')).toBe('untranslated.key')
	})
})
