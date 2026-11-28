import { expect, type Page, test } from '@playwright/test'
import { productDayKey } from '../src/lib/product-day'
import { CONSENT_KEY } from '../src/lib/storage-keys'
import { adsId, capture, commands, id, purchaseLabel } from './google-tag-support'

const game = '/games/sudoku'
const daily = `${game}?difficulty=easy`
const explicit = `${daily}&start=1#play`
const board = '[data-game-stage="board"] .play-board'
const rpc = (name: string) => `**/puzzled.v1.PuzzleService/${name}`
const consentContext = '**/api/consent-context'

const starts = async (page: Page) =>
	(await commands(page)).filter(([command, name]) => command === 'event' && name === 'game_start')

// Wait for the mounted lifecycle effect, not just server-rendered HTML.
const expectBoardObserved = (page: Page) =>
	expect
		.poll(() => page.evaluate(() => Boolean(sessionStorage.getItem('puzzled:daily-level:sudoku'))))
		.toBe(true)
const expectCommand = (page: Page, command: string, name: string) =>
	expect.poll(() => commands(page)).toContainEqual([command, name, expect.anything()])

async function enterExplicitPlay(page: Page) {
	await page.locator('[data-start-intent="sudoku"]:visible').click()
	await expect(page).toHaveURL(/start=1/)
	await expect(page.locator('[data-play-canvas] .play-board')).toBeVisible()
}

async function leaveBoard(page: Page) {
	await page.getByRole('link', { name: 'Games', exact: true }).first().click()
	await expect(page).toHaveURL(/\/games$/)
	await expect(page.locator(board)).toHaveCount(0)
}

async function fixture(
	page: Page,
	choice: 'granted' | 'denied' | null,
	{ country = 'DE', gpc = false, pending = Promise.resolve(), status = 200 } = {},
) {
	await capture(page, false)
	await page.setExtraHTTPHeaders({ 'CF-IPCountry': country, ...(gpc && { 'Sec-GPC': '1' }) })
	await page.route(consentContext, async (route) => {
		await pending
		const { region, gpc, optOutMarket } = await (await route.fetch()).json()
		// Stub all destinations and omit Signal even when reading the real policy.
		await route.fulfill({
			status,
			json: {
				region,
				gpc,
				optOutMarket,
				ids: { ga: id, ads: adsId, adsPurchaseLabel: purchaseLabel },
			},
		})
	})
	const puzzleDataJson = JSON.stringify({
		grid: Array.from({ length: 9 }, () => Array(9).fill(null)),
		difficulty: 'easy',
	})
	await page.route(rpc('GetDaily'), (route) =>
		route.fulfill({
			json: { gameSlug: 'sudoku', puzzleDate: productDayKey(), canPlay: true, puzzleDataJson },
		}),
	)
	if (choice)
		await page.addInitScript(
			([key, value]) => localStorage.setItem(key, value),
			[CONSENT_KEY, choice],
		)
	await page.route('**/v1/guest/session', (route) => route.fulfill({ json: { issued: true } }))
	await page.route('**/puzzled.v1.FunnelService/RecordEvent', (route) => route.abort())
}

test.afterEach(({ page }) => page.unrouteAll({ behavior: 'ignoreErrors' }))

for (const [label, choice, country] of [
	['existing affirmative choice', 'granted', undefined],
	['named opt-out market default', null, 'US'],
] as const) {
	test(`${label}: late readiness, remount and new visit`, async ({ page }) => {
		const { promise, resolve } = Promise.withResolvers<void>()
		await fixture(page, choice, { pending: promise, country })
		await page.goto(`${daily}&gclid=fixture-click&email=fixture%40example.test`)
		try {
			await expect(page.locator(board)).toBeVisible()
			await expectBoardObserved(page)
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
		await expectCommand(page, 'config', adsId)
		await expect.poll(() => starts(page)).toEqual([start])
		await expect
			.poll(() => commands(page))
			.toContainEqual([
				'event',
				'page_view',
				expect.objectContaining({ page_location: expect.stringContaining('gclid=fixture-click') }),
			])
		await enterExplicitPlay(page)
		expect(await starts(page)).toEqual([start])

		await leaveBoard(page)
		await page.locator(`a[href="${game}"]`).first().click()
		const choices = page.getByRole('group', { name: 'Select Difficulty' })
		await choices.getByRole('radio', { name: 'Easy' }).check()
		expect(await starts(page)).toEqual([start]) // choosing is not a playable board
		await choices.getByRole('link', { name: "Play today's puzzle" }).click()
		await expect(page.locator(board)).toBeVisible()
		await expect.poll(() => starts(page)).toEqual([start, start])
	})
}

test('late opt-in cannot replay a passive board', async ({ page }) => {
	await fixture(page, null)
	await page.goto(daily)
	await expectBoardObserved(page)
	expect(await starts(page)).toEqual([])
	await page.getByRole('button', { name: 'Analytics only', exact: true }).click()
	await expectCommand(page, 'config', id)
	await enterExplicitPlay(page)
	expect(await starts(page)).toEqual([])
})

for (const [label, choice, country, gpc] of [
	['named-market denial', 'denied', 'US', false],
	['named-market GPC', null, 'US', true],
	['GPC despite a saved grant', 'granted', 'DE', true],
	['other ROW without a saved grant', null, 'BR', false],
	['unknown market without a saved grant', null, 'XX', false],
] as const) {
	test(`a playable board emits no GA4 start under ${label}`, async ({ page }) => {
		await fixture(page, choice, { country, gpc })
		await page.goto(explicit)
		await expect(page.locator(board)).toBeVisible()
		await expectCommand(page, 'consent', 'default')
		expect(await starts(page)).toEqual([])
	})
}

for (const scenario of ['GPC', 'denial', 'config failure', 'route leave'] as const) {
	test(`a pending start is discarded on ${scenario}`, async ({ page }) => {
		const { promise, resolve } = Promise.withResolvers<void>()
		await fixture(page, null, {
			pending: promise,
			country: 'US',
			gpc: scenario === 'GPC',
			status: scenario === 'config failure' ? 503 : 200,
		})
		const contextResponse = page.waitForResponse(consentContext)
		try {
			await page.goto(daily)
			await expectBoardObserved(page)
			if (scenario === 'denial')
				await page.evaluate((key) => localStorage.setItem(key, 'denied'), CONSENT_KEY)
			if (scenario === 'route leave') await leaveBoard(page)
		} finally {
			resolve()
		}
		await contextResponse
		if (scenario !== 'config failure') await expectCommand(page, 'consent', 'default')
		expect(await starts(page)).toEqual([])
	})
}

test('preview, pending and failed play do not count', async ({ page }) => {
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
	await expectCommand(page, 'config', id)
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
