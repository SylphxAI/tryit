import { expect, test } from '@playwright/test'
import { productDayKey } from '../src/lib/product-day'

const subscriptionRpc = '**/puzzled.v1.BillingService/GetSubscription'

for (const billing of ['eligible', 'entitled', 'closed', 'unavailable', 'first-pick'] as const) {
	test(`the completed free set celebrates without a misleading Plus offer (${billing})`, async ({
		page,
	}) => {
		const today = productDayKey()
		const completeSet = billing !== 'first-pick'
		let billingReads = 0
		await page.route('**/v1/guest/session', (route) => route.fulfill({ json: { issued: true } }))
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
			if (billing === 'unavailable')
				return route.fulfill({ status: 503, json: { code: 'unavailable' } })
			return route.fulfill({
				json: { salesOpen: billing !== 'closed', entitled: billing === 'entitled' },
			})
		})
		await page.goto('/games/sudoku?difficulty=easy&start=1#play')
		const billingResponse = completeSet ? page.waitForResponse(subscriptionRpc) : undefined
		await page.getByRole('button', { name: 'See your result' }).click()
		const result = page.getByRole('dialog', { name: 'Sudoku Complete' })
		await expect(result.getByText('1:18', { exact: true })).toBeVisible()
		await expect(
			result.getByText(`${completeSet ? 3 : 1} of 3 free picks used today`),
		).toBeVisible()
		const celebration = result.getByText('That’s today’s free set. Nicely played!')
		const offer = result.getByRole('link', { name: 'Keep playing with Tryit Plus' })
		if (completeSet) {
			await expect(celebration).toBeVisible()
			await (await billingResponse)?.finished()
			await expect(result.getByRole('link', { name: /^Play next:/ })).toHaveCount(0)
		} else await expect(celebration).toHaveCount(0)
		if (billing === 'eligible') await expect(offer).toHaveAttribute('href', '/pricing')
		else await expect(offer).toHaveCount(0)
		expect(billingReads).toBe(completeSet ? 1 : 0)
	})
}
