import { expect, test } from 'bun:test'
import { locales } from '@/lib/i18n/config'
import { createTranslator } from '@/lib/i18n/translate'
import { resultCardRetention, resultRetentionPrompt } from './result-card-retention'

const win = { mode: 'daily', status: 'won' } as const
const loss = { mode: 'daily', status: 'lost' } as const
const archive = { mode: 'archive', status: 'won' } as const

test.each([3, 7, 30, 100])('a daily win marks the exact %i-day milestone', (days) => {
	const streak = { currentStreak: days, freezeUsedYesterday: false }
	expect(resultCardRetention(win, streak, true).milestone).toBe(days)
	expect(resultCardRetention(loss, streak, true).milestone).toBeNull()
	expect(resultCardRetention(archive, streak, true).milestone).toBeNull()
})

test.each([0, 1, 2, 4, 6, 8, 29, 31, 99, 101])('%i days does not mark a milestone', (days) => {
	expect(
		resultCardRetention(win, { currentStreak: days, freezeUsedYesterday: false }, true).milestone,
	).toBeNull()
})

test('freeze reassurance needs a daily win and the explicit server flag', () => {
	const saved = { currentStreak: 2, freezeUsedYesterday: true }
	expect(resultCardRetention(win, saved, false).freezeSaved).toBe(true)
	expect(
		resultCardRetention(win, { ...saved, freezeUsedYesterday: false }, false).freezeSaved,
	).toBe(false)
	expect(resultCardRetention(loss, saved, true).freezeSaved).toBe(false)
	expect(resultCardRetention(archive, saved, true).freezeSaved).toBe(false)
	expect(resultCardRetention(win, null, true).freezeSaved).toBe(false)
})

for (const mode of ['daily', 'practice', 'archive'] as const) {
	for (const status of ['won', 'lost'] as const) {
		for (const [identity, isGuest] of [
			['guest', true],
			['account', false],
		] as const) {
			test.each([0, 1, 2])(`save-streak offer: ${mode} ${status}, ${identity}, %i days`, (days) => {
				const streak = { currentStreak: days, freezeUsedYesterday: false }
				const retention = resultCardRetention({ mode, status }, streak, isGuest)
				expect(retention.captureGuest).toBe(mode === 'daily' && isGuest && days > 0)
				if (retention.captureGuest) expect(retention.days).toBe(days)
			})
		}
	}
}

test.each([win, loss])(
	'save-streak requires both a server streak and a confirmed guest (%j)',
	(card) => {
		expect(resultCardRetention(card, null, true).captureGuest).toBe(false)
		expect(
			resultCardRetention(card, { currentStreak: 1, freezeUsedYesterday: false }, undefined)
				.captureGuest,
		).toBe(false)
	},
)

test.each([
	['guest win with a save offer', win, true, false, 'save-streak'],
	['guest loss with a save offer', loss, true, false, 'save-streak'],
	['signed-in win', win, false, false, 'install'],
	['signed-in loss', loss, false, false, 'none'],
	['guest win after earlier dismissal', win, true, true, 'install'],
	['guest loss after earlier dismissal', loss, true, true, 'none'],
] as const)('%s selects one retention prompt', (_name, card, guest, dismissedEarlier, expected) => {
	const { captureGuest } = resultCardRetention(
		card,
		{ currentStreak: 1, freezeUsedYesterday: false },
		guest,
	)
	expect(resultRetentionPrompt(card.status, true, captureGuest && !dismissedEarlier)).toBe(expected)
})

test('dismissing save-streak does not reveal install on this finish', () => {
	const selected = resultRetentionPrompt('won', true, true)
	const dismissed = resultRetentionPrompt('won', true, false, selected, true)
	expect(dismissed).toBe('none')
	expect(resultRetentionPrompt('won', true, false, dismissed)).toBe('none')
	expect(resultRetentionPrompt('won', true, false)).toBe('install')
})

test('an older win cannot offer installation', () => {
	expect(resultRetentionPrompt('won', false, false)).toBe('none')
})

test.each(locales)('%s has usable milestone, freeze, and account copy', (locale) => {
	const t = createTranslator(locale)
	const milestone = t('gameResult.streakMilestone', { days: 100 })
	const keep = t('onboarding.keepStreak', { days: 7 })
	expect(milestone).toContain('100')
	expect(keep).toContain('7')
	const copy = [milestone, keep]
	for (const key of [
		'gameResult.freezeSaved',
		'gameResult.shareResult',
		'onboarding.saveStreak',
		'onboarding.saveStreakNote',
		'onboarding.createFreeAccount',
	]) {
		const value = t(key)
		expect(value).not.toBe(key)
		expect(value.trim()).not.toBe('')
		copy.push(value)
	}
	expect(copy.join(' ')).not.toMatch(/sylphx/i)
	if (locale === 'zh-HK' || locale === 'zh-TW')
		expect(copy.join(' ')).not.toMatch(/[咗嘅喺冇唔佢咁啲嚟嘢]/)
})
