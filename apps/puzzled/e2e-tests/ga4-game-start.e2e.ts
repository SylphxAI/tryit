import { expect, type Page, test } from '@playwright/test'
import { productDayKey } from '../src/lib/product-day'
import { CONSENT_KEY } from '../src/lib/storage-keys'
import { adsId, capture, commands, id, purchaseLabel } from './google-tag-support'

const game = '/games/sudoku'
const daily = `${game}?difficulty=easy`
const explicit = `${daily}&start=1#play`
const board = '[data-game-stage="board"] .play-board'
const rpc = (name: string) => `**/puzzled.v1.PuzzleService/${name}`

const starts = async (page: Page) =>
	(await commands(page)).filter(([command, name]) => command === 'event' && name === 'game_start')

// The pre-existing once-per-board lifecycle records this presentation hint.
const boardObserved = (page: Page) =>
	page.evaluate(() => sessionStorage.getItem('puzzled:daily-level:sudoku') !== null)

async function fixture(
	page: Page,
	choice: 'granted' | 'denied' | null,
	{ gpc = false, region = 'EEA', pending = Promise.resolve(), status = 200 } = {},
) {
	await capture(page, false)
	await page.route('**/api/consent-context', async (route) => {
		await pending
		await route.fulfill({
			status,
			json: { region, gpc, ids: { ga: id, ads: adsId, adsPurchaseLabel: purchaseLabel } },
		})
	})
	await page.route(rpc('GetDaily'), (route) =>
		route.fulfill({
			json: {
				gameSlug: 'sudoku',
				puzzleDate: productDayKey(),
				canPlay: true,
				puzzleDataJson: JSON.stringify({
					difficulty: 'easy',
					grid: Array.from({ length: 9 }, () => Array(9).fill(null)),
				}),
			},
		}),
	)
	await page.addInitScript(
		({ key, choice }) => {
			if (choice) localStorage.setItem(key, choice)
		},
		{ key: CONSENT_KEY, choice },
	)
	await page.route('**/v1/guest/session', (route) => route.fulfill({ json: { issued: true } }))
	await page.route('**/puzzled.v1.FunnelService/RecordEvent', (route) =>
		route.fulfill({ json: {} }),
	)
}

test.afterEach(({ page }) => page.unrouteAll({ behavior: 'ignoreErrors' }))

test('GA4 records the playable visit, not the explicit Play remount; a new visit counts', async ({
	page,
}) => {
	const { promise, resolve } = Promise.withResolvers<void>()
	await fixture(page, 'granted', { pending: promise })
	await page.goto(`${daily}&gclid=fixture-click&email=fixture%40example.test`)
	try {
		await expect(page.locator(board)).toBeVisible()
		// Wait for the mounted lifecycle effect, not just server-rendered HTML.
		await expect.poll(() => boardObserved(page)).toBe(true)
		expect(await starts(page)).toEqual([])
	} finally {
		resolve()
	}
	const start = [
		'event',
		'game_start',
		{
			game_slug: 'sudoku',
			mode: 'daily',
			page_location: new URL(game, page.url()).href,
			page_referrer: '',
			send_to: id,
		},
	]
	// Both destinations are on; game_start is nevertheless GA4-only with no landing fields.
	await expect.poll(() => commands(page)).toContainEqual(['config', adsId, expect.anything()])
	await expect.poll(() => starts(page)).toEqual([start])
	await expect
		.poll(() => commands(page))
		.toContainEqual([
			'event',
			'page_view',
			expect.objectContaining({ page_location: expect.stringContaining('gclid=fixture-click') }),
		])
	await page.locator('[data-start-intent="sudoku"]').first().click()
	await expect(page).toHaveURL(/start=1/)
	await expect(page.locator('[data-play-canvas] .play-board')).toBeVisible()
	expect(await starts(page)).toEqual([start])

	await page.getByRole('link', { name: 'Games', exact: true }).first().click()
	await expect(page).toHaveURL(/\/games$/)
	await page.locator(`a[href="${game}"]`).first().click()
	await expect(page.locator('[data-start-intent="sudoku"]').first()).toBeVisible()
	expect(await starts(page)).toEqual([start]) // chooser, not another playable board
	await page.locator('[data-start-intent="sudoku"][href*="difficulty=easy"]').first().click()
	await expect(page.locator(board)).toBeVisible()
	await expect.poll(() => starts(page)).toEqual([start, start])
})

test('granting after the passive board does not replay on the explicit Play remount', async ({
	page,
}) => {
	await fixture(page, null)
	await page.goto(daily)
	await expect(page.locator(board)).toBeVisible()
	const banner = page.locator('[data-consent-banner]')
	await expect(banner).toBeVisible()
	await expect.poll(() => boardObserved(page)).toBe(true)
	expect(await starts(page)).toEqual([])
	await banner.getByRole('button', { name: 'Analytics only', exact: true }).click()
	await expect.poll(() => commands(page)).toContainEqual(['config', id, expect.anything()])
	await page.locator('[data-start-intent="sudoku"]').first().click()
	await expect(page).toHaveURL(/start=1/)
	await expect(page.locator('[data-play-canvas] .play-board')).toBeVisible()
	expect(await starts(page)).toEqual([])
})

for (const [label, choice, gpc, region] of [
	['denied', 'denied', false, 'EEA'],
	['GPC despite a saved grant', 'granted', true, 'EEA'],
	['ROW without a saved grant', null, false, 'ROW'],
] as const) {
	test(`a playable board emits no GA4 start under ${label}`, async ({ page }) => {
		await fixture(page, choice, { gpc, region })
		await page.goto(explicit)
		await expect(page.locator(board)).toBeVisible()
		await expect
			.poll(() => commands(page))
			.toContainEqual(['consent', 'default', expect.anything()])
		expect(await starts(page)).toEqual([])
	})
}

for (const scenario of ['GPC', 'config failure', 'route leave'] as const) {
	test(`a pending start is discarded on ${scenario}`, async ({ page }) => {
		const { promise, resolve } = Promise.withResolvers<void>()
		await fixture(page, 'granted', {
			pending: promise,
			gpc: scenario === 'GPC',
			status: scenario === 'config failure' ? 503 : 200,
		})
		const contextResponse = page.waitForResponse('**/api/consent-context')
		try {
			await page.goto(daily)
			await expect.poll(() => boardObserved(page)).toBe(true)
			if (scenario === 'route leave') {
				await page.locator('a[href="/games"]').first().click()
				await expect(page).toHaveURL(/\/games$/)
				await expect(page.locator(board)).toHaveCount(0)
			}
			expect(await starts(page)).toEqual([])
		} finally {
			resolve()
		}
		await contextResponse
		if (scenario !== 'config failure') {
			await expect
				.poll(() => commands(page))
				.toContainEqual(['consent', 'default', expect.anything()])
		}
		expect(await starts(page)).toEqual([])
	})
}

test('startable preview, Play request in flight, and failed StartDaily do not count', async ({
	page,
}) => {
	await fixture(page, 'granted')
	await page.route(rpc('GetDaily'), (route) =>
		route.fulfill({
			json: { gameSlug: 'sudoku', puzzleDate: productDayKey(), canPlay: true, requiresStart: true },
		}),
	)
	const { promise, resolve } = Promise.withResolvers<void>()
	await page.route(rpc('StartDaily'), async (route) => {
		await promise
		await route.fulfill({ status: 503, json: { code: 'unavailable', message: 'fixture failure' } })
	})
	await page.goto(explicit)
	const play = page
		.locator('[data-game-stage="start"]')
		.getByRole('button', { name: 'Play', exact: true })
	await expect(play).toBeVisible()
	await expect.poll(() => commands(page)).toContainEqual(['config', id, expect.anything()])
	expect(await starts(page)).toEqual([])
	try {
		const requested = page.waitForRequest(rpc('StartDaily'))
		await play.click()
		await requested
		await expect(play).toBeDisabled()
		expect(await starts(page)).toEqual([])
	} finally {
		resolve()
	}
	await expect(page.getByRole('button', { name: 'Try again', exact: true })).toBeVisible()
	await expect(page.locator(board)).toHaveCount(0)
	expect(await starts(page)).toEqual([])
})
