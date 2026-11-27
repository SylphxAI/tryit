import { expect, test } from '@playwright/test'
import { productDayKey } from '../src/lib/product-day'
import { passReference } from './pass-offer-support'

const subscriptionRpc = '**/puzzled.v1.BillingService/GetSubscription'
const passGuestCookie = '__Host-puzzled_guest=first-finish-fixture; Secure; HttpOnly; Path=/'

const freeSetCases = ['eligible', 'entitled', 'closed', 'unavailable'] as const
const firstCases = [
	'first-pick',
	'first-pick-503',
	'first-pick-claim',
	'first-pick-account',
	'first-pick-no-guest-context',
] as const
for (const billing of [...freeSetCases, ...firstCases] as const) {
	const completeSet = freeSetCases.some((value) => value === billing)
	const title = completeSet
		? 'the completed free set celebrates without a misleading Plus offer'
		: 'the first finish keeps the result usable with an optional pass'
	test(`${title} (${billing})`, async ({ page, context, baseURL }) => {
		const today = productDayKey()
		let billingReads = 0
		let billingMutations = 0
		await page.route(
			/\/puzzled\.v1\.BillingService\/(ClaimCheckout|CreateCheckout|CreateCheckoutAttempt)$/,
			(route) => {
				billingMutations++
				return route.abort()
			},
		)
		const offerStarted = Promise.withResolvers<void>()
		const allowOffer = Promise.withResolvers<void>()
		await page.route('**/v1/guest/session', (route) =>
			route.fulfill({
				json: { issued: true },
				headers:
					completeSet || billing === 'first-pick-no-guest-context'
						? undefined
						: { 'Set-Cookie': passGuestCookie },
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
		await page.route(subscriptionRpc, async (route) => {
			billingReads++
			if (!completeSet) return route.abort()
			if (billing === 'unavailable')
				return route.fulfill({ status: 503, json: { code: 'unavailable' } })
			return route.fulfill({
				json: { salesOpen: billing !== 'closed', entitled: billing === 'entitled' },
			})
		})
		const cookie =
			billing === 'first-pick-claim'
				? 'puzzled_checkout_claim'
				: billing === 'first-pick-account'
					? 'puzzled_session'
					: null
		if (cookie)
			await context.addCookies([{ name: cookie, value: 'fixture', url: baseURL, httpOnly: true }])
		const id = completeSet ? null : await passReference()
		if (id && billing !== 'first-pick') {
			await page.route('**/_server', async (route) => {
				if (route.request().headers()['x-server-id'] !== id) return route.fallback()
				offerStarted.resolve()
				await allowOffer.promise
				return billing === 'first-pick-503' ? route.fulfill({ status: 503 }) : route.continue()
			})
		}
		await page.goto('/games/sudoku?difficulty=easy&start=1#play')
		const billingResponse = completeSet ? page.waitForResponse(subscriptionRpc) : null
		const offerResponse = id
			? page.waitForResponse((response) => response.request().headers()['x-server-id'] === id)
			: null
		const seeResult = page.getByRole('button', { name: 'See your result' })
		await seeResult.click()
		const result = page.getByRole('dialog', { name: 'Sudoku Complete' })
		await expect(result.getByText('1:18', { exact: true })).toBeVisible()
		await expect(
			result.getByText(`${completeSet ? 3 : 1} of 3 free picks used today`),
		).toBeVisible()
		const celebration = result.getByText('That’s today’s free set. Nicely played!')
		const offer = result.getByRole('link', { name: 'Keep playing with Tryit Plus' })
		const share = result.getByRole('button', { name: 'Copy challenge' })
		await (await billingResponse)?.finished()
		if (completeSet) {
			await expect(celebration).toBeVisible()
			await expect(result.getByRole('link', { name: /^Play next:/ })).toHaveCount(0)
		} else await expect(celebration).toHaveCount(0)
		if (billing === 'eligible') await expect(offer).toHaveAttribute('href', '/pricing')
		else await expect(offer).toHaveCount(0)
		if (!completeSet) {
			const pass = result.locator('[data-pass-offer="first_finish"]')
			if (billing === 'first-pick') {
				const response = await offerResponse
				expect(response?.headers()['cache-control']).toBe('private, no-store')
				await expect(pass.getByText('€2.99 once · no renewal')).toBeVisible()
				await expect(pass.getByRole('link', { name: 'See the 3-day pass' })).toHaveAttribute(
					'href',
					'/pricing?plan=individual_once&trigger=result_card#plus',
				)
				const exit = pass.locator('[data-pass-offer-exit]')
				await expect(exit).toHaveText('Keep playing free')
				expect((await exit.boundingBox())?.height ?? 0).toBeGreaterThanOrEqual(44)
				await exit.click()
			} else {
				try {
					await offerStarted.promise
					await expect(share).toBeVisible()
					await expect(share).toBeEnabled()
				} finally {
					allowOffer.resolve()
				}
				const response = await offerResponse
				await response?.finished()
				expect(response?.status()).toBe(billing === 'first-pick-503' ? 503 : 200)
				if (cookie || billing === 'first-pick-no-guest-context') {
					expect(response?.headers()['cache-control']).toBe('private, no-store')
					expect(await response?.text()).not.toContain('2.99')
				}
			}
			await expect(pass).toHaveCount(0)
			await expect(share).toBeVisible()
			await page.keyboard.press('Escape')
			await expect(seeResult).toBeVisible()
		}
		expect(billingReads).toBe(completeSet ? 1 : 0)
		expect(billingMutations).toBe(0)
	})
}
