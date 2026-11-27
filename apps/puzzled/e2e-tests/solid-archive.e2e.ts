import { readdir, readFile } from 'node:fs/promises'
import AxeBuilder from '@axe-core/playwright'
import { expect, test } from '@playwright/test'
import { archiveDayKeys } from '../src/features/daily/lib/archive-days'
import { productDayKey } from '../src/lib/product-day'
import { CONSENT_KEY } from '../src/lib/storage-keys'
import { settle, WCAG_TAGS } from './a11y-support'

test.afterEach(async ({ page }) => {
	await page.unrouteAll({ behavior: 'ignoreErrors' })
})

// Run against the Solid production build with the open-plan puzzle fixture as API_INTERNAL_URL.
test('archive calendar and category link to the chosen past day without starting a game', async ({
	page,
}) => {
	await page.setViewportSize({ width: 360, height: 750 })
	const getDailyRequests: unknown[] = []
	const progressRequests: unknown[] = []
	const paywallEvents: unknown[] = []
	await page.route('**/puzzled.v1.FunnelService/RecordEvent', async (route) => {
		const request = route.request()
		const body = request.postDataJSON()
		if (body.event === 'paywall_hit') {
			expect(await request.headerValue('cookie')).toBeNull()
			paywallEvents.push(body)
		}
		await route.fulfill({ json: {} })
	})
	await page.route('**/puzzled.v1.PuzzleService/*', (route) => {
		const path = new URL(route.request().url()).pathname
		// The lock impression reads today’s count, never the selected archive day.
		if (path === '/puzzled.v1.PuzzleService/GetTodayProgress') {
			progressRequests.push(route.request().postDataJSON())
			return route.fulfill({
				json: { dayKey: productDayKey(), freePicks: { gameSlugs: ['sudoku', 'nonogram'] } },
			})
		}
		expect(path).toBe('/puzzled.v1.PuzzleService/GetDaily')
		getDailyRequests.push(route.request().postDataJSON())
		return route.fulfill({
			status: 403,
			json: { code: 'permission_denied', message: 'plus_required_archive' },
		})
	})
	const response = await page.goto('/archive')
	expect(response?.headers()['cache-control']).toBe('private, no-store')
	await expect(page.getByRole('heading', { name: 'Your puzzle archive' })).toBeVisible()
	const dates = page.getByRole('group', { name: 'Pick a day' }).getByRole('button')
	const games = page.locator('[data-archive-almanac] a')
	await expect(page.getByRole('link', { name: 'Back to all games' })).toHaveCount(0)
	await expect(page.getByText(/^Yesterday, .+ is a good place to start/)).toBeVisible()
	await expect(dates).toHaveCount(30)
	await expect(games).toHaveCount(19)
	await expect(games.locator('svg.lucide-lock-keyhole[aria-hidden="true"]')).toHaveCount(19)
	await expect(page.getByText('Plus to play', { exact: true })).toHaveCount(0)
	await expect(games.first()).toHaveAccessibleDescription('Requires Tryit Plus')
	const original = await page.locator('#archive-day-title time').getAttribute('datetime')
	await dates.nth(1).click()
	await expect(dates.nth(1)).toHaveAttribute('aria-pressed', 'true')
	const selected = await page.locator('#archive-day-title time').getAttribute('datetime')
	expect(selected).toMatch(/^[0-9]{4}-[0-9]{2}-[0-9]{2}$/)
	expect(selected).not.toBe(original)
	await page.getByRole('button', { name: 'Word', exact: true }).click()
	await expect(page.getByRole('button', { name: 'Word', exact: true })).toHaveAttribute(
		'aria-pressed',
		'true',
	)
	await expect(page.locator('[data-archive-almanac] a[href^="/games/sudoku?"]')).toHaveCount(0)
	const link = page.locator('[data-archive-almanac] a[href^="/games/word-search?"]')
	await expect(link).toHaveAttribute('href', `/games/word-search?mode=archive&date=${selected}`)
	expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(360)
	expect(getDailyRequests).toEqual([])
	expect(progressRequests).toEqual([])
	expect(paywallEvents).toEqual([])
	await link.click()
	await expect(page.locator('[data-unlock-panel="archive"]')).toBeVisible()
	await expect(
		page.getByRole('heading', { name: 'Past days are part of Tryit Plus' }),
	).toBeVisible()
	await expect
		.poll(() => paywallEvents)
		.toEqual([
			{
				event: 'paywall_hit',
				surface: 'archive_lock',
				gameSlug: 'word-search',
				picksUsed: 2,
				currency: 'USD',
				isGuest: true,
			},
		])
	expect(getDailyRequests).toEqual([{ gameSlug: 'word-search', puzzleDate: selected }])
	// Connect JSON omits a repeated field when it has no entries.
	expect(progressRequests).toEqual([{}])
})

for (const viewport of [
	{ width: 1440, height: 900 },
	{ width: 390, height: 844 },
]) {
	test(`archive unlock is visible above the calendar at ${viewport.width}px and preserves attribution`, async ({
		page,
	}) => {
		await page.setViewportSize(viewport)
		await page.setExtraHTTPHeaders({ 'CF-IPCountry': 'DE' })
		await page.goto('/archive')
		await expect(page.locator('[data-consent-banner]')).toBeVisible()
		await page.evaluate(() => document.fonts.ready)
		const offer = page.getByRole('complementary', { name: 'Unlock all 30 past days' })
		const cta = offer.getByRole('link', { name: 'Unlock archive' })
		await expect(offer).toHaveCount(1)
		await expect(page.locator('[data-archive-unlock]')).toHaveCount(1)
		await expect(offer).toBeInViewport({ ratio: 1 })
		await expect(cta).toHaveAttribute(
			'href',
			'/pricing?callbackUrl=%2Farchive&trigger=archive_banner',
		)
		await expect(offer.getByRole('checkbox')).toHaveCount(0)
		const box = await offer.boundingBox()
		const calendar = await page.locator('[data-archive-almanac]').boundingBox()
		const dock = await page.locator('[data-consent-banner]').boundingBox()
		expect(box!.y + box!.height).toBeLessThanOrEqual(Math.min(calendar!.y, dock!.y))
		expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(viewport.width)
		await settle(page)
		expect((await new AxeBuilder({ page }).withTags(WCAG_TAGS).analyze()).violations).toEqual([])
		await cta.click()
		await expect(page).toHaveURL(
			(url) =>
				url.pathname === '/pricing' &&
				url.search === '?callbackUrl=%2Farchive&trigger=archive_banner',
		)
	})
}

// Use the actual SolidStart serialization and Connect catalogue projection on the happy path.
async function unlockPriceReference() {
	const dir = '.output/server/_ssr'
	for (const file of await readdir(dir)) {
		if (!file.endsWith('.mjs')) continue
		const match = (await readFile(`${dir}/${file}`, 'utf8')).match(
			/createServerReference\("([^"]+)", async function readUnlockPrices\(/,
		)
		if (match) return match[1]
	}
	throw new Error('Missing built readUnlockPrices reference')
}

for (const scenario of [
	'locked',
	'pending',
	'entitled',
	'unknown',
	'closed',
	'missing-pass',
	'price-failure',
] as const) {
	test(`dated archive lock buyer journey (${scenario})`, async ({
		page,
		context,
		baseURL,
	}, testInfo) => {
		const url = new URL(baseURL ?? '')
		expect(['localhost', '127.0.0.1']).toContain(url.hostname)
		const origin = url.origin
		const [date] = archiveDayKeys(productDayKey(), 1)
		const prefix = scenario === 'locked' ? '/en-GB' : ''
		const game = `${prefix}/games/number-path`
		const callback = `${game}?date=${date}`
		const trigger = 'game_unlock_archive'
		const pricing = `${prefix}/pricing?callbackUrl=${encodeURIComponent(callback)}&trigger=${trigger}`
		const passPricing = `${prefix}/pricing?plan=individual_once&callbackUrl=${encodeURIComponent(callback)}&trigger=${trigger}#plus`
		await page.setViewportSize(
			scenario === 'locked' ? { width: 375, height: 812 } : { width: 1440, height: 900 },
		)
		await page.setExtraHTTPHeaders({ 'CF-IPCountry': prefix ? 'GB' : 'US' })
		await page.addInitScript((key) => localStorage.setItem(key, 'denied'), CONSENT_KEY)
		const billingWrites: string[] = []
		await context.route('**/*', (route) => {
			const request = route.request()
			const target = new URL(request.url())
			if (
				target.pathname.startsWith('/puzzled.v1.BillingService/') &&
				!target.pathname.endsWith('/ListPlans')
			) {
				billingWrites.push(target.pathname)
				return route.abort()
			}
			return target.origin === origin ? route.continue() : route.abort()
		})
		if (scenario === 'missing-pass') {
			await context.addCookies([
				{
					name: '__Host-puzzled_guest',
					value: 'archive-no-pass',
					domain: url.hostname,
					path: '/',
					secure: true,
					httpOnly: true,
				},
			])
		}
		const priceId = await unlockPriceReference()
		const allowOffer = Promise.withResolvers<void>()
		let priceReads = 0
		await page.route('**/_server', async (route) => {
			if (route.request().headers()['x-server-id'] !== priceId) return route.fallback()
			priceReads++
			await allowOffer.promise
			return scenario === 'price-failure' ? route.fulfill({ status: 503 }) : route.continue()
		})
		await page.route('**/puzzled.v1.PuzzleService/GetDaily', (route) => {
			const input = route.request().postDataJSON()
			if (!input.puzzleDate) return route.fallback()
			expect(input).toEqual({ gameSlug: 'number-path', puzzleDate: date })
			// Model the already-existing GetDaily boundary, not an entitlement lookup in the lock.
			if (scenario === 'entitled' || scenario === 'closed') {
				return route.fulfill({ json: { ...input, canPlay: true, requiresStart: true } })
			}
			return scenario === 'unknown'
				? route.fulfill({ status: 503, json: { code: 'unavailable' } })
				: route.fulfill({
						status: 403,
						json: { code: 'permission_denied', message: 'plus_required_archive' },
					})
		})
		await page.route('**/puzzled.v1.PuzzleService/GetTodayProgress', (route) =>
			route.fulfill({ json: { dayKey: productDayKey(), freePicks: { gameSlugs: [] } } }),
		)
		await page.route('**/v1/guest/session', (route) => route.fulfill({ json: { issued: true } }))
		await page.route('**/puzzled.v1.FunnelService/RecordEvent', (route) =>
			route.fulfill({ json: {} }),
		)

		const lock = page.locator('[data-unlock-panel="archive"]')
		const plus = lock.getByRole('link', { name: 'See Tryit Plus' })
		const free = lock.getByRole('link', { name: 'Back to today’s games' })
		const pass = lock.getByRole('link', { name: /See the 3-day pass/i })
		const playFree = async () => {
			await free.click()
			await expect(page).toHaveURL(`${origin}${prefix}/games`)
			await page.locator('[data-game-tile="number-path"]').click()
			await expect(page.locator('[data-game-stage="board"] .play-board')).toBeVisible()
			await expect(lock).toHaveCount(0)
			expect(billingWrites).toEqual([])
		}
		await page.goto(`${game}?mode=archive&date=${date}`)
		try {
			if (scenario === 'entitled' || scenario === 'unknown' || scenario === 'closed') {
				await expect(
					scenario === 'unknown'
						? page.getByRole('heading', { name: 'Puzzle not available' })
						: page.locator('[data-game-stage="start"]').getByRole('button', { name: 'Play' }),
				).toBeVisible()
				await expect(lock).toHaveCount(0)
				expect(priceReads).toBe(0)
				return
			}

			await expect.poll(() => priceReads).toBe(1)
			await expect(plus).toHaveAttribute('href', pricing)
			await expect(free).toHaveAttribute('href', `${prefix}/games`)
			await free.click({ trial: true })
			await plus.click({ trial: true })
			await expect(pass).toHaveCount(0)
			if (scenario === 'pending') {
				await plus.click()
				await expect(page).toHaveURL(origin + pricing)
				await expect(page.locator('#plus')).toBeVisible()
				await page.goBack()
				await playFree()
				return
			}
		} finally {
			allowOffer.resolve()
		}

		if (scenario === 'locked') {
			await expect(lock.locator('[data-unlock-plan="individual_yearly"]')).toContainText('£29.99')
			await expect(lock.locator('[data-unlock-plan="individual_once"]')).toContainText('£2.99')
			await expect(lock.locator('[data-unlock-plan="individual_once"]')).toContainText('one time')
			await expect(pass).toHaveAttribute('href', passPricing)
			await pass.focus()
			await expect(pass).toBeFocused()
			expect((await pass.boundingBox())!.height).toBeGreaterThanOrEqual(48)
			expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(375)
			await settle(page)
			expect((await new AxeBuilder({ page }).withTags(WCAG_TAGS).analyze()).violations).toEqual([])
			await testInfo.attach('archive-lock-375px', {
				body: await lock.screenshot(),
				contentType: 'image/png',
			})
			expect(priceReads).toBe(1)
			await page.setViewportSize({ width: 1440, height: 900 })
			expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(1440)
			await testInfo.attach('archive-lock-1440px', {
				body: await lock.screenshot(),
				contentType: 'image/png',
			})
			await pass.press('Enter')
			await expect(page).toHaveURL(origin + passPricing)
			await expect(page.locator('#plus input[type="radio"]:checked')).toHaveValue('once')
			await expect(page.locator('#plus [data-checkout-trigger]')).toHaveAttribute(
				'data-checkout-trigger',
				trigger,
			)
			await expect(page.locator('#plus input[type="checkbox"]')).not.toBeChecked()
			await expect(page.locator('#plus [data-checkout-trigger]')).toBeDisabled()
			await page.goBack()
			await plus.click()
			await expect(page).toHaveURL(origin + pricing)
			await expect(page.locator('#plus [data-checkout-trigger]')).toHaveAttribute(
				'data-checkout-trigger',
				trigger,
			)
			await page.goBack()
		} else {
			if (scenario === 'missing-pass') {
				await expect(lock.locator('[data-unlock-plan="individual_yearly"]')).toContainText('$39.99')
			} else {
				await expect(lock.getByText('Tryit Plus plans are temporarily unavailable')).toBeVisible()
			}
			await expect(pass).toHaveCount(0)
			await expect(lock.locator('[data-unlock-plan="individual_once"]')).toHaveCount(0)
			await expect(plus).toHaveAttribute('href', pricing)
			expect(priceReads).toBe(1)
		}

		await playFree()
	})
}
