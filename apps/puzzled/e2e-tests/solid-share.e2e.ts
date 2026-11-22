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
		await expect(page.getByRole('link', { name: "Play today's Sudoku" })).toHaveAttribute(
			'href',
			`/games/sudoku?ref=${fixtureShareId}&utm_source=friend`,
		)
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
		await expect(page.getByRole('link', { name: "Play today's Sudoku" })).toHaveAttribute(
			'href',
			'/games/sudoku?ref=unknown&utm_source=share',
		)
	})
})
