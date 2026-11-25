import AxeBuilder from '@axe-core/playwright'
import { expect, test } from '@playwright/test'
import { productDayKey } from '../src/lib/product-day'
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
