import { expect, type Page, test } from '@playwright/test'
import killerGoldens from '../../../crates/puzzled-core/tests/fixtures/generate/killer-sudoku.json'
import pathGoldens from '../../../crates/puzzled-core/tests/fixtures/generate/number-path.json'
import { nextProductDayStart, productDayKey } from '../src/lib/product-day'
import {
	CONSENT_KEY,
	PWA_PROMPT_DISMISSED_KEY,
	SAVE_STREAK_DISMISSED_DAY_KEY,
} from '../src/lib/storage-keys'
import { passReference } from './pass-offer-support'

const picks = ['number-path', 'killer-sudoku', 'sudoku']
const sudoku = Array.from({ length: 9 }, (_, r) =>
	Array.from({ length: 9 }, (_, c) =>
		r === 8 && c === 8 ? null : ((r * 3 + Math.floor(r / 3) + c) % 9) + 1,
	),
)
const counter = '3 of 3 free picks used today'
const installTitle = 'Add Tryit to your Home Screen'
const won = '[data-board-finished]'
const sudokuPath = '/games/sudoku?difficulty=easy&start=1#play'

async function fixture(
	page: Page,
	options?: { ios?: boolean; standalone?: boolean; issueGuest?: boolean },
) {
	const dayKey = productDayKey()
	const started = new Set<string>()
	let finished = false
	await page.addInitScript(
		({ consentKey, dismissedSaveKey, dayKey, ios, standalone }) => {
			localStorage.setItem(consentKey, 'denied')
			// These fixtures check install availability after an earlier save-streak dismissal.
			localStorage.setItem(dismissedSaveKey, dayKey)
			if (ios)
				Object.defineProperty(navigator, 'userAgent', {
					value: 'Mozilla/5.0 (iPhone) Version/18.0 Mobile/15E148 Safari/604.1',
				})
			if (standalone) {
				const native = window.matchMedia.bind(window)
				window.matchMedia = (query) =>
					native(query === '(display-mode: standalone)' ? 'all' : query)
			}
		},
		{
			consentKey: CONSENT_KEY,
			dismissedSaveKey: SAVE_STREAK_DISMISSED_DAY_KEY,
			dayKey,
			ios: options?.ios,
			standalone: options?.standalone,
		},
	)
	const rpc = (name: string) => '**/puzzled.v1.PuzzleService/' + name
	const daily = (gameSlug: string, difficulty?: string) => {
		const data =
			gameSlug === 'sudoku'
				? { grid: sudoku, difficulty: 'easy' }
				: gameSlug === 'killer-sudoku'
					? killerGoldens.find((entry) => entry.difficulty === difficulty && 'puzzleData' in entry)
							?.puzzleData
					: pathGoldens[0].puzzleData
		return { gameSlug, puzzleDate: dayKey, canPlay: true, puzzleDataJson: JSON.stringify(data) }
	}
	await page.route('**/v1/guest/session', (route) =>
		route.fulfill({
			json: { issued: true },
			headers: options?.issueGuest
				? {
						'Set-Cookie':
							'__Host-puzzled_guest=cap-fixture; Path=/; HttpOnly; Secure; SameSite=Lax',
					}
				: undefined,
		}),
	)
	await page.route(rpc('GetDaily'), (route) => {
		const { gameSlug, difficulty } = route.request().postDataJSON()
		if (!started.has(gameSlug) && started.size === 3)
			return route.fulfill({
				status: 403,
				json: { code: 'permission_denied', message: 'plus_required' },
			})
		return route.fulfill({
			json: started.has(gameSlug)
				? daily(gameSlug, difficulty)
				: { gameSlug, puzzleDate: dayKey, canPlay: true, requiresStart: true },
		})
	})
	await page.route(rpc('StartDaily'), async (route) => {
		if (options?.issueGuest) {
			const cookies = await route.request().headerValue('cookie')
			expect(cookies?.split('; ')).toContain('__Host-puzzled_guest=cap-fixture')
		}
		const { gameSlug, difficulty, puzzleDate } = route.request().postDataJSON()
		expect(puzzleDate).toBe(dayKey)
		expect(picks).toContain(gameSlug)
		started.add(gameSlug)
		return route.fulfill({ json: { daily: daily(gameSlug, difficulty) } })
	})
	await page.route(rpc('GetTodayProgress'), (route) =>
		route.fulfill({
			json: {
				dayKey,
				freePicks: { gameSlugs: [...started] },
				games:
					route
						.request()
						.postDataJSON()
						.gameSlugs?.map((gameSlug: string) => ({
							gameSlug,
							hasCompleted: gameSlug === 'sudoku' && finished,
						})) ?? [],
			},
		}),
	)
	await page.route(rpc('SubmitGuess'), (route) => {
		finished = true
		return route.fulfill({ json: { gameSlug: 'sudoku', valid: true, status: 'won', score: 487 } })
	})
	await page.route(rpc('ShareResult'), (route) => route.fulfill({ json: {} }))
	await page.route('**/puzzled.v1.GamificationService/GetStreakInfo', (route) =>
		route.fulfill({ json: { info: { currentStreak: 4 } } }),
	)
	return { dayKey, started }
}

for (const { prefix, lang, backToToday } of [
	{ prefix: '', lang: 'en-US', backToToday: 'Back to today’s games' },
	{ prefix: '/zh-HK', lang: 'zh-HK', backToToday: '返回今日遊戲' },
	{ prefix: '/ja', lang: 'ja', backToToday: '今日のゲームに戻る' },
]) {
	for (const viewport of [
		{ width: 390, height: 844 },
		{ width: 1440, height: 900 },
	]) {
		test(`pricing free exit at the cap: ${lang} ${viewport.width}px`, async ({
			page,
			context,
			baseURL,
		}) => {
			const origin = new URL(baseURL ?? 'http://localhost:3000')
			expect(['localhost', '127.0.0.1']).toContain(origin.hostname)
			await page.setViewportSize(viewport)
			await page.setExtraHTTPHeaders({ 'Accept-Language': lang })
			const { started } = await fixture(page)
			for (const pick of picks) started.add(pick)
			await context.addCookies([
				{
					name: '__Host-puzzled_guest',
					value: 'cap-fixture',
					domain: origin.hostname,
					path: '/',
					secure: true,
					httpOnly: true,
				},
			])
			const writes: string[] = []
			await page.route(
				/\/puzzled\.v1\.(?:PuzzleService\/StartDaily|BillingService\/CreateCheckout)$/,
				(route) => {
					writes.push(route.request().url())
					return route.abort()
				},
			)
			const callback = `${prefix}/games/crowns`
			const pricingUrl = `${prefix}/pricing?plan=individual_once&trigger=game_unlock&callbackUrl=${encodeURIComponent(callback)}#plus`
			await page.goto(callback)
			const lock = page.locator('[data-unlock-panel="picks"]')
			await expect(lock.locator(`a[href^="${prefix}/games/number-path?start=1"]`)).toBeVisible()
			await lock.locator('[data-pass-offer="pick_limit"] a').click()
			await expect(page).toHaveURL(origin.origin + pricingUrl)
			const exit = page.locator('#plus').getByRole('link', { name: backToToday, exact: true })
			await expect(exit).toHaveAttribute('href', `${prefix}/games`)
			await exit.click()
			await expect(page).toHaveURL(`${origin.origin}${prefix}/games`)
			await expect(page.locator('html')).toHaveAttribute('lang', lang)
			await expect(page.locator('[data-game-stage], [data-unlock-panel]')).toHaveCount(0)
			await page.locator('[data-game-tile="number-path"]').click()
			await expect(page).toHaveURL(`${origin.origin}${prefix}/games/number-path`)
			await expect(page.locator('[data-game-stage="board"] .play-board')).toBeVisible()
			await expect(page.locator('[data-game-stage="start"], [data-unlock-panel]')).toHaveCount(0)
			expect(writes).toEqual([])
		})
	}
}

test('generic pricing, archive and unrelated callbacks keep the fresh-guest free exit', async ({
	page,
	baseURL,
}) => {
	const origin = new URL(baseURL ?? 'http://localhost:3000')
	expect(['localhost', '127.0.0.1']).toContain(origin.hostname)
	await page.setExtraHTTPHeaders({ 'Accept-Language': 'en-US' })
	await fixture(page)
	const freeExit = page.getByRole('link', {
		name: 'Not now — play 3 free puzzles of 19 daily',
		exact: true,
	})
	await page.goto('/pricing')
	const featured = await freeExit.getAttribute('href')
	expect(featured).toMatch(/^\/games\/[^/?#]+$/)
	for (const search of [
		{ trigger: 'pricing_card', callbackUrl: '/games/crowns' },
		{ trigger: 'game_unlock', callbackUrl: '/games/crowns?date=2026-01-01' },
		{ trigger: 'game_unlock', callbackUrl: '/games/not-a-game' },
		{ trigger: 'game_unlock', callbackUrl: '//example.invalid/games/crowns' },
	]) {
		await page.goto(`/pricing?${new URLSearchParams(search)}`)
		await expect(freeExit).toHaveAttribute('href', featured ?? '')
	}
	await freeExit.click()
	await expect(page).toHaveURL(origin.origin + featured)
	await expect(page.locator('a[data-start-intent]').first()).toBeVisible()
	await expect(page.locator('[data-unlock-panel]')).toHaveCount(0)
})

async function start(page: Page, path: string) {
	await page.goto(path)
	await page.locator('[data-game-stage="start"] button').click()
	await expect(page.locator('[data-game-stage="board"] .play-board')).toBeVisible()
}

async function finish(page: Page) {
	await page.getByRole('button', { name: 'Row 9, Column 9', exact: true }).click()
	await page.getByRole('button', { name: '8', exact: true }).click()
	await expect(page.locator(won)).toBeVisible()
}

async function dispatchInstallEvent(page: Page) {
	await page.evaluate(() => {
		const event = new Event('beforeinstallprompt', { cancelable: true })
		Object.assign(event, {
			prompt: async () => {
				sessionStorage.setItem('test-native-prompt', 'called')
			},
			userChoice: Promise.resolve({ outcome: 'dismissed' }),
		})
		window.dispatchEvent(event)
	})
}

for (const viewport of [
	{ width: 390, height: 844 },
	{ width: 1440, height: 900 },
]) {
	for (const colorScheme of ['light', 'dark'] as const) {
		test.describe(`${viewport.width}×${viewport.height} ${colorScheme}`, () => {
			test.use({ viewport, colorScheme })
			test('three starts and one win agree on the cap; locked game offers prices and resumes', async ({
				page,
				baseURL,
				context,
			}) => {
				await page.emulateMedia({ reducedMotion: 'reduce' })
				const origin = new URL(baseURL ?? 'http://localhost:3000')
				expect(['localhost', '127.0.0.1']).toContain(origin.hostname)
				await page.setExtraHTTPHeaders({
					'CF-IPCountry': colorScheme === 'dark' ? 'DE' : 'XX',
					'Accept-Language': 'en-US',
				})
				const { started } = await fixture(page, { ios: viewport.width === 390, issueGuest: true })
				const installEvents: unknown[] = []
				await page.route('**/puzzled.v1.FunnelService/RecordEvent', (route) => {
					const body = route.request().postDataJSON()
					if (body.event.startsWith('pwa_install')) installEvents.push(body)
					return route.fulfill({ json: {} })
				})
				await page.goto('/')
				await expect(page.getByText('0 of 3 free picks used today')).toBeVisible()
				await expect(page.getByText(installTitle)).toHaveCount(0)
				expect((await context.cookies()).some(({ name }) => name === '__Host-puzzled_guest')).toBe(
					false,
				)
				await start(page, '/games/number-path?start=1#play')
				expect(
					(await context.cookies()).find(({ name }) => name === '__Host-puzzled_guest'),
				).toMatchObject({
					secure: true,
					httpOnly: true,
				})
				await start(page, '/games/killer-sudoku?difficulty=hard&start=1#play')
				await start(page, sudokuPath)
				if (viewport.width === 1440) await dispatchInstallEvent(page)
				await expect(page.locator('.play-intro').getByText(counter)).toBeVisible()
				await expect(page.getByText(installTitle)).toHaveCount(0)
				await finish(page)
				const rail = page.locator(won)
				await expect(rail.getByText('Current Streak: 4')).toBeInViewport()
				await expect(rail.getByRole('link', { name: /^Resume:/ })).toBeInViewport()
				await expect(rail.getByText(installTitle)).toBeVisible()
				await expect
					.poll(() => installEvents.slice())
					.toEqual([
						{
							event: 'pwa_install_prompted',
							platform: viewport.width === 390 ? 'ios_guide' : 'chromium',
							trigger: 'post_first_win',
							isGuest: true,
						},
					])
				if (viewport.width === 390) {
					await expect(rail.getByText('Tap Share → Add to Home Screen.')).toBeVisible()
					await rail.getByRole('button', { name: 'Dismiss' }).click()
				} else {
					await rail.getByRole('button', { name: 'Install App' }).click()
					expect(await page.evaluate(() => sessionStorage.getItem('test-native-prompt'))).toBe(
						'called',
					)
				}
				await expect(rail.getByText(installTitle)).toHaveCount(0)
				expect(
					await page.evaluate((key) => localStorage.getItem(key), PWA_PROMPT_DISMISSED_KEY),
				).toBe('1')
				await rail.getByRole('button', { name: 'See your result' }).click()
				const dialog = page.getByRole('dialog', { name: 'Sudoku Complete' })
				await expect(dialog.getByText(counter)).toBeVisible()
				await expect(dialog).toHaveCSS('opacity', '1')
				await expect(dialog).toHaveCSS(
					'background-color',
					colorScheme === 'dark' ? 'rgb(29, 28, 25)' : 'rgb(255, 255, 255)',
				)
				expect(
					await dialog.evaluate((el) => getComputedStyle(el, '::backdrop').backgroundColor),
				).toBe('rgba(20, 18, 15, 0.96)')
				const firstPass = dialog.locator('[data-pass-offer="first_finish"]')
				const passPrice = colorScheme === 'dark' ? '€2.99' : '$2.99'
				await expect(firstPass.getByText(`${passPrice} once · no renewal`)).toBeVisible()
				await firstPass.getByRole('button', { name: 'Keep playing free' }).click()
				await expect(firstPass).toHaveCount(0)
				await expect(dialog.getByRole('button', { name: 'Copy challenge' })).toBeEnabled()
				await page.goto('/')
				await expect(page.locator('.home-day-masthead').getByText(counter)).toBeVisible()
				await expect(page.getByText(installTitle)).toHaveCount(0)
				await page.goto('/games/crowns')
				const lock = page.locator('[data-unlock-panel="picks"]')
				await expect(lock.getByRole('heading', { name: 'Tryit Plus' })).toBeVisible()
				await expect(lock.getByText(counter)).toBeVisible()
				await expect(page.getByRole('link', { name: "Play today's puzzle" })).toHaveCount(0)
				const pass = lock.locator('[data-pass-offer="pick_limit"]')
				await expect(pass.getByText(`${passPrice} once · no renewal`)).toBeVisible()
				await expect(pass.getByRole('link', { name: 'See the 3-day pass' })).toHaveAttribute(
					'href',
					'/pricing?plan=individual_once&trigger=game_unlock&callbackUrl=%2Fgames%2Fcrowns#plus',
				)
				const exit = pass.locator('[data-pass-offer-exit]')
				await expect(exit).toHaveText('Come back tomorrow')
				await exit.click()
				await expect(pass).toHaveCount(0)
				const resetAt = nextProductDayStart().getTime()
				await page.clock.install({ time: resetAt - 3 * 60_000 })
				await page.clock.runFor(1_100)
				const countdown = lock.locator('time')
				await expect(countdown).toHaveAttribute('data-reset-at', new Date(resetAt).toISOString())
				await expect(countdown).toHaveText('Resets in 0h 3m')
				await page.clock.fastForward(60_000)
				await expect(countdown).toHaveText('Resets in 0h 2m')

				await expect(lock.locator('[data-unlock-plan]')).toHaveCount(3)
				expect(
					await lock
						.locator('[data-unlock-plan]')
						.evaluateAll((rows) => rows.map((row) => row.getAttribute('data-unlock-plan'))),
				).toEqual(['individual_yearly', 'individual_once', 'individual_monthly'])
				await expect(
					lock.getByText('All 19 daily games + puzzles from the past 30 days, completely ad-free'),
				).toBeVisible()
				await expect(lock.getByText('one time', { exact: true })).toBeVisible()
				expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBe(0)
				const prices = await lock.locator('[data-unlock-plan] dd').allTextContents()
				expect(prices.every((price) => price.includes(colorScheme === 'dark' ? '€' : '$'))).toBe(
					true,
				)
				const pricing = await context.newPage()
				await pricing.setExtraHTTPHeaders({
					'CF-IPCountry': colorScheme === 'dark' ? 'DE' : 'XX',
					'Accept-Language': 'en-US',
				})
				await pricing.goto(
					(await lock.getByRole('link', { name: 'See Tryit Plus' }).getAttribute('href')) ??
						'/pricing',
				)
				for (const price of prices)
					await expect(
						pricing.locator('#plus').getByText(price, { exact: true }).first(),
					).toBeVisible()
				const hero = lock.locator('[data-unlock-plan="individual_yearly"]')
				const yearly = pricing.locator('#plus').getByRole('radio', { name: /^Yearly/ })
				await expect(yearly).toBeChecked()
				for (const pattern of [/Save \d+%/, /[^\s]+ a month/]) {
					const chip = hero.getByText(pattern)
					await expect(chip).toBeVisible()
					const copy = (await chip.textContent()) ?? ''
					await expect(pricing.locator('#plus').getByText(copy, { exact: true })).toBeVisible()
				}
				await pricing.close()
				await expect(lock.getByRole('link', { name: /^Resume:/ })).toHaveCount(2)
				const hard = lock.getByRole('link', { name: 'Resume: Cage Sudoku' })
				await expect(hard).toHaveAttribute(
					'href',
					'/games/killer-sudoku?difficulty=hard&start=1#play',
				)
				await hard.click()
				await expect(page.locator('[data-game-stage="board"] .play-board')).toBeVisible()
				await expect(page.locator('[data-game-stage="start"]')).toHaveCount(0)
				expect([...started]).toEqual(picks)
			})
		})
	}
}

test('a new win does not show the install card when running standalone', async ({ page }) => {
	await fixture(page, { ios: true, standalone: true })
	await start(page, sudokuPath)
	await finish(page)
	await expect(page.locator(won).getByText('Current Streak: 4')).toBeVisible()
	await expect(page.getByText(installTitle)).toHaveCount(0)
})

test('a fresh win still keeps a previously dismissed iOS tip hidden', async ({ page }) => {
	await fixture(page, { ios: true })
	await page.addInitScript((key) => localStorage.setItem(key, '1'), PWA_PROMPT_DISMISSED_KEY)
	await start(page, sudokuPath)
	await finish(page)
	await expect(page.locator(won).getByText('Current Streak: 4')).toBeVisible()
	await expect(page.getByText(installTitle)).toHaveCount(0)
})

test('the pick limit hides the contextual pass when guest context is lost', async ({
	page,
	context,
	baseURL,
}) => {
	const { started } = await fixture(page)
	for (const pick of picks) started.add(pick)
	const origin = new URL(baseURL ?? 'http://localhost:3000')
	expect(['localhost', '127.0.0.1']).toContain(origin.hostname)
	await context.addCookies([
		{
			name: '__Host-puzzled_guest',
			value: 'cap-fixture',
			domain: origin.hostname,
			path: '/',
			secure: true,
			httpOnly: true,
		},
	])
	// Render the server-confirmed lock, then lose the cookie before hydration.
	await page.route(
		'**/games/crowns',
		async (route) => {
			const response = await route.fetch()
			await context.clearCookies({ name: '__Host-puzzled_guest' })
			return route.fulfill({ response })
		},
		{ times: 1 },
	)
	const id = await passReference()
	const offerResponse = page.waitForResponse(
		(response) => response.request().headers()['x-server-id'] === id,
	)
	await page.goto('/games/crowns')
	const lock = page.locator('[data-unlock-panel="picks"]')
	await expect(lock.getByText(counter)).toBeVisible()
	const response = await offerResponse
	expect((await response.request().headerValue('cookie')) ?? '').not.toContain(
		'__Host-puzzled_guest=',
	)
	expect(response.status()).toBe(200)
	expect(response.headers()['cache-control']).toBe('private, no-store')
	expect(await response.text()).not.toContain('"price"')
	await expect(lock.locator('[data-pass-offer]')).toHaveCount(0)
	await expect(lock.getByRole('link', { name: 'Back to today’s games', exact: true })).toBeVisible()
})
