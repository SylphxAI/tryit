import { expect, test } from 'bun:test'
import { locales } from '@/lib/i18n/config'
import { createTranslator } from '@/lib/i18n/translate'
import { homeParticipationCopy } from './home-participation-copy'

const invitation = 'Today’s puzzles are ready. Play any three free, no signup needed.'

test('show the invitation until at least 50 players have finished', () => {
	const t = createTranslator('en-US')
	for (const count of [undefined, null, 0, 1, 49, Number.NaN, 50.1]) {
		expect(homeParticipationCopy(t, count)).toBe(invitation)
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

test('low-traffic invitation is translated in every supported non-English locale', () => {
	for (const locale of locales) {
		const message = homeParticipationCopy(createTranslator(locale), 1)
		expect(message).not.toBe('home.hero.dailyInvitation')
		if (!locale.startsWith('en-')) expect(message).not.toBe(invitation)
	}
	expect(homeParticipationCopy(createTranslator('zh-TW'), 1)).toBe(
		'今天的謎題準備好了！任選 3 款免費玩，不用註冊。',
	)
})
