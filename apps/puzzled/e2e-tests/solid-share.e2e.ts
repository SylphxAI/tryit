import { expect, test } from '@playwright/test'
import { fixtureShareId } from '../scripts/share-fixture-facts'
import { productDayKey } from '../src/lib/product-day'
import { CHALLENGE_KEY } from '../src/lib/storage-keys'

test.describe('Solid shared results', () => {
	test.skip(process.env.SOLID_SHARE_FIXTURE !== '1', 'requires the read-only puzzle fixture')

	test('ordinary localized daily links redirect to a game with attribution intact', async ({
		request,
	}) => {
		const response = await request.get('/zh-HK/daily?g=sudoku&utm_source=tryit&ref=partner', {
			maxRedirects: 0,
		})
		expect(response.status()).toBe(307)
		expect(response.headers().location).toBe(
			'/zh-HK/games/sudoku?g=sudoku&utm_source=tryit&ref=partner',
		)
	})

	test('a known share renders a non-spoiler card and preserves the challenge in the play link', async ({
		page,
		context,
		baseURL,
	}) => {
		// Auth and guest cookies are not needed for a public share; the fixture refuses them.
		await context.addCookies([
			{ name: 'puzzled_session', value: 'unrelated-session', url: baseURL },
		])
		let optedInCalls = 0
		await page.route('**/RecordShareLanding', async (route) => {
			optedInCalls += 1
			await route.fulfill({ json: {} })
		})
		const response = await page.goto(`/r/${fixtureShareId}?g=nonogram&utm_source=friend`)
		expect(response?.status()).toBe(200)
		await expect(page.locator('meta[name=robots]')).toHaveAttribute('content', 'noindex, nofollow')
		await expect(page.locator('meta[property="og:title"]')).toHaveAttribute(
			'content',
			'Sudoku: a result to beat',
		)
		await expect(page.getByRole('heading', { name: 'Can you beat it?' })).toBeVisible()
		const card = page.getByRole('region', { name: 'Their result' })
		await expect(card).toContainText('Solved!')
		await expect(card).toContainText('37')
		await expect(card).not.toContainText('answer')
		const play = page.getByRole('link', { name: "Play today's Sudoku" })
		await expect(play).toHaveAttribute(
			'href',
			`/games/sudoku?ref=${fixtureShareId}&utm_source=friend&difficulty=medium&start=1#play`,
		)
		await expect(play).toHaveAttribute('data-start-intent', 'sudoku')
		await expect
			.poll(() =>
				page.evaluate((key) => JSON.parse(localStorage.getItem(key) ?? 'null'), CHALLENGE_KEY),
			)
			.toEqual({ shareId: fixtureShareId, gameSlug: 'sudoku', dayKey: productDayKey() })
		expect(optedInCalls).toBe(0)
	})

	test('legacy daily share links work and an unknown invite has a playable fallback', async ({
		page,
	}) => {
		await page.goto(`/daily?ref=${fixtureShareId}&ref=ignored&utm_source=share`)
		await expect(page.getByRole('region', { name: 'Their result' })).toBeVisible()
		await page.goto('/r/unknown?game=sudoku')
		await expect(page.getByRole('region', { name: 'Their result' })).toHaveCount(0)
		const play = page.getByRole('link', { name: "Play today's Sudoku" })
		await expect(play).toHaveAttribute('href', '/games/sudoku?ref=unknown&utm_source=share')
		await expect(play).not.toHaveAttribute('data-start-intent', /.*/)
	})

	test("one tap on today's share starts that board once; landing, hover and pasted links never do", async ({
		page,
		context,
	}) => {
		const starts: Array<Record<string, unknown>> = []
		// Production's edge routes same-origin /puzzled.v1.* to the api; here the
		// read-only fixture answers reads, and StartDaily is caught, never served.
		const api = process.env.API_INTERNAL_URL ?? 'http://127.0.0.1:8787'
		await context.route(/\/puzzled\.v1\.PuzzleService\/\w+$/, async (route) => {
			const { pathname } = new URL(route.request().url())
			if (pathname.endsWith('/GetDaily')) {
				// An unclaimed pick: the board needs an explicit StartDaily.
				const response = await route.fetch({ url: api + pathname })
				return route.fulfill({
					response,
					json: { ...(await response.json()), requiresStart: true },
				})
			}
			if (!pathname.endsWith('/StartDaily')) return route.fallback({ url: api + pathname })
			starts.push(route.request().postDataJSON() ?? {})
			return route.abort()
		})
		// The guest cookie bootstrap precedes StartDaily; it is stubbed and writes nothing.
		await context.route(/\/v1\/guest\/session$/, (route) =>
			route.fulfill({ json: { issued: false } }),
		)
		const started = `/zh-HK/games/sudoku?ref=${fixtureShareId}&utm_source=share&difficulty=medium&start=1#play`
		// A pasted copy of the started link carries no press: it shows the start card and waits.
		await page.goto(started)
		await expect(page.locator('html')).toHaveAttribute('lang', 'zh-HK')
		await page.waitForLoadState('networkidle')
		expect(starts).toHaveLength(0)
		await page.goto(`/zh-HK/r/${fixtureShareId}?utm_source=share`)
		const play = page.locator('a[data-start-intent="sudoku"]')
		await expect(play).toHaveAttribute('href', started)
		await play.hover()
		await page.waitForLoadState('networkidle')
		expect(starts).toHaveLength(0)
		// A modified click opens a new tab that records no press and starts nothing.
		const [tab] = await Promise.all([
			context.waitForEvent('page'),
			play.click({ modifiers: ['ControlOrMeta'] }),
		])
		await tab.waitForLoadState('networkidle')
		expect(new URL(tab.url()).pathname).toBe('/zh-HK/games/sudoku')
		expect(starts).toHaveLength(0)
		await tab.close()
		await play.click()
		await expect(page).toHaveURL((url) => `${url.pathname}${url.search}${url.hash}` === started)
		await expect.poll(() => starts.length).toBe(1)
		expect(starts[0]).toMatchObject({ gameSlug: 'sudoku', puzzleDate: productDayKey() })
		await page.waitForLoadState('networkidle')
		expect(starts.length).toBeLessThanOrEqual(1)
	})
})
