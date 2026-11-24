import { expect, test } from 'bun:test'
import { locales } from '@/lib/i18n/config'
import { createTranslator } from '@/lib/i18n/translate'
import { homeParticipationCopy } from './home-participation-copy'

test('participation only appears at 50 verified finishers or more', () => {
	const t = createTranslator('en-US')
	for (const count of [undefined, null, 0, 1, 49, Number.NaN, 50.1]) {
		expect(homeParticipationCopy(t, count)).toBeNull()
	}
	expect(homeParticipationCopy(t, 50)).toBe('50 players finished today')
	expect(homeParticipationCopy(t, 1234)).toBe('1,234 players finished today')
})

test('English count copy pluralizes numeric values before formatting', () => {
	for (const locale of ['en-US', 'en-GB'] as const) {
		const t = createTranslator(locale)
		expect(t('home.hero.playersToday', { count: 1 })).toBe('1 player finished today')
		expect(t('home.hero.playersToday', { count: 2 })).toBe('2 players finished today')
	}
})

test('participation is translated in each supported locale', () => {
	for (const locale of locales) {
		const message = homeParticipationCopy(createTranslator(locale), 50)
		expect(message).not.toBe('home.hero.playersToday')
		if (!locale.startsWith('en-')) expect(message).not.toBe('50 players finished today')
	}
})
