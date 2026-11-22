import { describe, expect, test } from 'bun:test'
import { createTranslator } from '@/lib/i18n/translate'

const LOCALES = ['en-US', 'zh-HK', 'zh-CN', 'zh-TW'] as const

describe('consent banner copy', () => {
	test.each([...LOCALES])('%s uses one short sentence in the resolved catalogue', (locale) => {
		const message = createTranslator(locale)('consent.message')
		expect(message).not.toBe('consent.message')
		expect(message.length).toBeLessThanOrEqual(110)
		expect(message.replace(/[.。]$/, '')).not.toMatch(/[.。]/)
	})
})
