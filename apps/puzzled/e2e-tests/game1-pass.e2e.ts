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
		if (cookie || completeSet)
			await context.addCookies([
				{ name: cookie ?? 'puzzled_session', value: 'fixture', url: baseURL, httpOnly: true },
			])
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
			await expect(result.getByRole('link', { name: 'See the 3-day pass' })).toHaveCount(0)
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

const fixtureApi = `http://127.0.0.1:${process.env.FIXTURE_API_PORT ?? '8787'}`
const guestName = '__Host-puzzled_guest'
const guestCases = [
	'guest',
	'held-claim',
	'ambiguous-guest',
	'authorization',
	'no-pass-price',
	'offer-unavailable',
] as const

for (const scenario of guestCases) {
	test(`the completed free set keeps the result usable and offers the pass only to an eligible guest (${scenario})`, async ({
		page,
		context,
		baseURL,
		request,
	}) => {
		if (!baseURL || !['localhost', '127.0.0.1'].includes(new URL(baseURL).hostname)) {
			throw new Error('The completed-set regression requires a built loopback server')
		}
		const value = scenario === 'no-pass-price' ? 'no-pass-price-fixture' : 'completed-set-fixture'
		const cookie = `${guestName}=${value}`
		await page.route('**/__fixture_guest', (route) =>
			route.fulfill({
				headers: { 'Set-Cookie': `${cookie}; Secure; HttpOnly; Path=/` },
				body: 'Guest fixture',
			}),
		)
		await page.goto('/__fixture_guest')
		if (scenario === 'held-claim')
			await context.addCookies([
				{ name: 'puzzled_checkout_claim', value: 'fixture', url: baseURL, httpOnly: true },
			])

		// Exercise the actual HTTP boundary, not a rejected JS promise: the same
		// credential accepted for puzzle progress is refused by account billing.
		if (scenario === 'guest') {
			const refusal = await request.post(
				`${fixtureApi}/puzzled.v1.BillingService/GetSubscription`,
				{
					headers: { cookie, 'connect-protocol-version': '1' },
					data: {},
				},
			)
			expect(refusal.status()).toBe(401)
			expect(await refusal.json()).toMatchObject({ code: 'unauthenticated' })
		}
		let subscriptionReads = 0
		let billingMutations = 0
		await page.route('**/*', (route) =>
			new URL(route.request().url()).origin === new URL(baseURL).origin
				? route.fallback()
				: route.abort(),
		)
		await page.route(
			/\/puzzled\.v1\.BillingService\/(ClaimCheckout|CreateCheckout|CreateCheckoutAttempt)$/,
			(route) => {
				billingMutations++
				return route.abort()
			},
		)
		await page.route('**/v1/guest/session', (route) => route.fulfill({ json: { issued: false } }))
		await page.route(
			/\/puzzled\.v1\.PuzzleService\/(GetDaily|GetTodayProgress)$/,
			async (route) => {
				const headers = await route.request().allHeaders()
				expect(headers.cookie).toContain(cookie)
				const path = new URL(route.request().url()).pathname
				return route.fulfill({ response: await route.fetch({ url: fixtureApi + path, headers }) })
			},
		)
		await page.route(subscriptionRpc, async (route) => {
			subscriptionReads++
			return route.fulfill({
				response: await route.fetch({
					url: fixtureApi + new URL(route.request().url()).pathname,
					headers: await route.request().allHeaders(),
				}),
			})
		})
		const id = await passReference()
		const offerStarted = Promise.withResolvers<void>()
		const allowOffer = Promise.withResolvers<void>()
		await page.route('**/_server', async (route) => {
			const headers = await route.request().allHeaders()
			if (headers['x-server-id'] !== id) return route.fallback()
			offerStarted.resolve()
			await allowOffer.promise
			if (scenario === 'offer-unavailable') return route.fulfill({ status: 503 })
			if (scenario === 'ambiguous-guest') headers.cookie += `; ${guestName}=second-fixture`
			if (scenario === 'authorization') headers.authorization = 'Bearer fixture-account'
			return scenario === 'ambiguous-guest' || scenario === 'authorization'
				? route.fulfill({ response: await route.fetch({ headers }) })
				: route.continue()
		})
		await page.goto('/games/sudoku?difficulty=easy&start=1#play')
		const seeResult = page.getByRole('button', { name: 'See your result' })
		const offerResponse = page.waitForResponse(
			(response) => response.request().headers()['x-server-id'] === id,
		)
		await seeResult.click()
		const result = page.getByRole('dialog', { name: 'Sudoku Complete' })
		const pass = result.getByRole('link', { name: 'See the 3-day pass' })
		try {
			await expect(result.getByText('3 of 3 free picks used today')).toBeVisible()
			await expect(result.getByText('That’s today’s free set. Nicely played!')).toBeVisible()
			await expect(result.getByRole('button', { name: 'Copy challenge' })).toBeEnabled()
			await expect(result.getByRole('link', { name: 'All games' })).toHaveAttribute(
				'href',
				'/games',
			)
			await expect(result.getByRole('link', { name: /^Play next:/ })).toHaveCount(0)
			await offerStarted.promise
			await expect(pass).toHaveCount(0)
		} finally {
			allowOffer.resolve()
		}
		const response = await offerResponse
		await response.finished()
		expect(response.status()).toBe(scenario === 'offer-unavailable' ? 503 : 200)
		const pricingPath = '/pricing?plan=individual_once&trigger=result_card_picks_exhausted#plus'
		if (scenario === 'guest') {
			expect(response.headers()['cache-control']).toBe('private, no-store')
			await expect(pass).toHaveAttribute('href', pricingPath)
			expect((await pass.boundingBox())?.height ?? 0).toBeGreaterThanOrEqual(44)
			await pass.click()
			await expect(page).toHaveURL(pricingPath)
			const pricing = page.locator('#plus')
			await expect(pricing.locator('input[type="radio"][value="once"]')).toBeChecked()
			await expect(pricing.locator('[data-checkout-trigger]')).toHaveAttribute(
				'data-checkout-trigger',
				'result_card_picks_exhausted',
			)
		} else {
			await expect(pass).toHaveCount(0)
			await page.keyboard.press('Escape')
			await expect(seeResult).toBeFocused()
		}
		expect(subscriptionReads).toBe(0)
		expect(billingMutations).toBe(0)
	})
}
