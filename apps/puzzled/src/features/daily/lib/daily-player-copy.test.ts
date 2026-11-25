import { expect, test } from 'bun:test'
import { locales } from '@/lib/i18n/config'
import { nextProductDayStart } from '@/lib/product-day'
import { dailyPlayerCopy } from './daily-player-copy'

const counters = [
	'2 of 3 free picks used today',
	'2 of 3 free picks used today',
	'今日 3 個免費名額已用 2 個',
	'今天 3 個免費名額已用 2 個',
	'今天 3 个免费名额已用 2 个',
	'今日の無料枠：3つ中2つ使用済み',
	'Hoy has usado 2 de tus 3 jugadas gratis',
	'2 de 3 escolhas grátis usadas hoje',
]

test('the shared label counts usage and interpolates two different values in all locales', () => {
	expect(locales.map((locale) => dailyPlayerCopy(locale).picks(2))).toEqual(counters)
	for (const locale of locales) {
		const copy = dailyPlayerCopy(locale)
		expect(copy.ios).toContain('→')
		expect(copy.reminders).not.toBe('')
		expect(copy.reset(180 * 60_000 + 11 * 60_000)).toMatch(/3.*11/)
	}
})

test('the countdown targets the real product reset, 16:00 UTC, and never goes negative', () => {
	const now = new Date('2026-11-25T14:57:30Z')
	const reset = nextProductDayStart(now)
	expect(reset.toISOString()).toBe('2026-11-25T16:00:00.000Z')
	expect(dailyPlayerCopy('en-US').reset(reset.getTime() - now.getTime())).toBe('Resets in 1h 3m')
	expect(dailyPlayerCopy('en-US').reset(-100)).toBe('Resets in 0h 0m')
})
