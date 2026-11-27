import { expect, test } from '@playwright/test'
import { productDayKey } from '../src/lib/product-day'

const subscriptionRpc = '**/puzzled.v1.BillingService/GetSubscription'
const passGuestCookie = '__Host-puzzled_guest=first-finish-fixture; Secure; HttpOnly; Path=/'

const freeSetCases = ['eligible', 'entitled', 'closed', 'unavailable'] as const
for (const billing of [...freeSetCases, 'first-pick', 'first-pick-503'] as const) {
	const completeSet = billing !== 'first-pick' && billing !== 'first-pick-503'
	const title = completeSet
		? 'the completed free set celebrates without a misleading Plus offer'
		: 'the first finish keeps the result usable with an optional pass'
	test(`${title} (${billing})`, async ({ page }) => {
		const today = productDayKey()
		let billingReads = 0
		await page.route('**/v1/guest/session', (route) =>
			route.fulfill({
				json: { issued: true },
				headers: completeSet ? undefined : { 'Set-Cookie': passGuestCookie },
			}),
		)
		await page.route('**/puzzled.v1.PuzzleService/GetDaily', (route) =>
			route.fulfill({
				json: {
					gameSlug: 'sudoku',
					puzzleDate: today,
					hasCompleted: true,
					canPlay: false,
					completedSession: { status: 'won', attempts: 1, score: 900, timeSpentMs: '78098' },
				},
			}),
		)
		await page.route('**/puzzled.v1.PuzzleService/GetTodayProgress', (route) =>
			route.fulfill({
				json: {
					dayKey: today,
					freePicks: { gameSlugs: completeSet ? ['crowns', 'number-path', 'sudoku'] : ['sudoku'] },
					games: ['crowns', 'number-path', 'sudoku'].map((gameSlug) => ({
						gameSlug,
						hasCompleted: gameSlug === 'sudoku' || completeSet,
					})),
				},
			}),
		)
		await page.route(subscriptionRpc, (route) => {
			billingReads++
			if (billing === 'unavailable' || billing === 'first-pick-503')
				return route.fulfill({ status: 503, json: { code: 'unavailable' } })
			return route.fulfill({
				json: { salesOpen: billing !== 'closed', entitled: billing === 'entitled' },
			})
		})
		await page.goto('/games/sudoku?difficulty=easy&start=1#play')
		const billingResponse = page.waitForResponse(subscriptionRpc)
		const seeResult = page.getByRole('button', { name: 'See your result' })
		await seeResult.click()
		const result = page.getByRole('dialog', { name: 'Sudoku Complete' })
		await expect(result.getByText('1:18', { exact: true })).toBeVisible()
		await expect(
			result.getByText(`${completeSet ? 3 : 1} of 3 free picks used today`),
		).toBeVisible()
		const celebration = result.getByText('That’s today’s free set. Nicely played!')
		const offer = result.getByRole('link', { name: 'Keep playing with Tryit Plus' })
		const response = await billingResponse
		await response.finished()
		if (completeSet) {
			await expect(celebration).toBeVisible()
			await expect(result.getByRole('link', { name: /^Play next:/ })).toHaveCount(0)
		} else await expect(celebration).toHaveCount(0)
		if (billing === 'eligible') await expect(offer).toHaveAttribute('href', '/pricing')
		else await expect(offer).toHaveCount(0)
		if (!completeSet) {
			const pass = result.locator('[data-pass-offer="first_finish"]')
			if (billing === 'first-pick') {
				await expect(pass.getByText('€2.99 once · no renewal')).toBeVisible()
				const exit = pass
					.getByRole('button', { name: 'Keep playing free' })
					.and(pass.locator('[data-pass-offer-exit]'))
				await expect(exit).toBeVisible()
				expect((await exit.boundingBox())?.height ?? 0).toBeGreaterThanOrEqual(44)
				await exit.click()
			} else expect(response.status()).toBe(503)
			await expect(pass).toHaveCount(0)
			await expect(result.getByRole('button', { name: 'Copy challenge' })).toBeVisible()
			await page.keyboard.press('Escape')
			await expect(seeResult).toBeVisible()
		}
		expect(billingReads).toBe(1)
	})
}
