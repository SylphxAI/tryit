import { expect, test } from 'bun:test'
import { locales } from '@/lib/i18n/config'
import { createTranslator } from '@/lib/i18n/translate'
import { resultCardRetention } from './result-card-retention'

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

test('account capture is only for a confirmed guest on a daily win, even without streak data', () => {
	expect(resultCardRetention(win, null, true).captureGuest).toBe(true)
	expect(resultCardRetention(win, null, false).captureGuest).toBe(false)
	expect(resultCardRetention(win, null, undefined).captureGuest).toBe(false)
	expect(resultCardRetention(loss, null, true).captureGuest).toBe(false)
	expect(resultCardRetention(archive, null, true).captureGuest).toBe(false)
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
