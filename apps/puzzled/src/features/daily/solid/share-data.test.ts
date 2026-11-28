import { afterEach, beforeEach, describe, expect, test } from 'bun:test'
import { productDayKey } from '@/lib/product-day'
import { readShareLanding } from './share-data'

const ID = '0f8fad5b-d9cb-469f-a165-70867728950e'
const now = new Date('2026-11-27T12:00:00Z')
const today = productDayKey(now)
const request = new Request('https://tryit.fun/r/x', { headers: { host: 'tryit.fun' } })

let shared: Record<string, unknown> | null = null
const originalBase = process.env.API_INTERNAL_URL
const originalFetch = globalThis.fetch

beforeEach(() => {
	process.env.API_INTERNAL_URL = 'http://share.test'
	globalThis.fetch = (async (input, init) => {
		const url = new Request(input, init).url
		// The landing may only read the shared result; never StartDaily or any write.
		expect(url).toEndWith('/puzzled.v1.PuzzleService/GetSharedResult')
		return shared
			? Response.json(shared)
			: Response.json({ code: 'not_found', message: 'gone' }, { status: 404 })
	}) as typeof fetch
})

afterEach(() => {
	process.env.API_INTERNAL_URL = originalBase
	globalThis.fetch = originalFetch
	shared = null
})

async function landing(locale: 'en-US' | 'zh-HK', search = '?utm_source=share') {
	const result = await readShareLanding(locale, ID, search, request, now)
	if (result.kind !== 'page') throw new Error('expected a page')
	return result.page
}

describe('share landing play CTA', () => {
	test("today's share of a known game links to the started board with a start intent", async () => {
		shared = { gameSlug: 'nonogram', puzzleDate: today, status: 'won', difficulty: 'hard' }
		const page = await landing('en-US')
		expect(page.startSlug).toBe('nonogram')
		expect(page.playHref).toBe(
			`/games/nonogram?ref=${ID}&utm_source=share&difficulty=hard&start=1#play`,
		)
		expect(page.memory).toEqual({ shareId: ID, gameSlug: 'nonogram', dayKey: today })
	})

	test('a game without levels starts without one; locale and attribution are kept', async () => {
		shared = { gameSlug: 'tango', puzzleDate: today, status: 'lost' }
		const page = await landing('zh-HK', '?utm_source=newsletter')
		expect(page.startSlug).toBe('duo')
		expect(page.playHref).toBe(`/zh-HK/games/duo?ref=${ID}&utm_source=newsletter&start=1#play`)
	})

	test('a missing level falls back to the default one-tap level', async () => {
		shared = { gameSlug: 'nonogram', puzzleDate: today, status: 'won', difficulty: 'bogus' }
		expect((await landing('en-US')).playHref).toContain('&difficulty=medium&start=1#play')
	})

	test('stale, unsupported or unreadable shares keep the plain link and record no intent', async () => {
		for (const value of [
			{ gameSlug: 'nonogram', puzzleDate: '2026-11-01', status: 'won' },
			{ gameSlug: 'not-a-game', puzzleDate: today, status: 'won' },
			null,
		]) {
			shared = value
			const page = await landing('en-US')
			expect(page.startSlug).toBeNull()
			expect(page.playHref).not.toContain('start=')
			expect(page.playHref).not.toContain('#play')
		}
	})
})
