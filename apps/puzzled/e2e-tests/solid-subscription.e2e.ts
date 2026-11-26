import { expect, type Page, test } from '@playwright/test'
import { fixtureToken } from '../scripts/auth-fixture-facts'
import { adsId, capture, commands, purchaseLabel } from './google-tag-support'

const fixture = process.env.SUBSCRIPTION_FIXTURE_URL ?? 'http://127.0.0.1:18894'

// The hosted edge forwards the same-origin Connect route to the API. The fixture has no edge.
async function forwardBilling(page: Page) {
	await page.route('**/puzzled.v1.BillingService/*', async (route) => {
		const request = route.request()
		const response = await fetch(fixture + new URL(request.url()).pathname, {
			method: request.method(),
			headers: { cookie: (await request.headerValue('cookie')) ?? '' },
			body: request.postData(),
		})
		await route.fulfill({
			status: response.status,
			headers: Object.fromEntries(response.headers),
			body: await response.text(),
		})
	})
}

test.describe('Solid subscription and family settings', () => {
	test.skip(
		process.env.SOLID_SUBSCRIPTION_FIXTURE !== '1',
		'requires local Auth and Money fixtures',
	)
	test.beforeEach(async () => {
		const reset = await fetch(`${fixture}/__fixture`, { method: 'DELETE' })
		expect(reset.ok).toBe(true)
	})

	test('localized guest handoff preserves the safe return and never leaks private data', async ({
		request,
	}) => {
		const guest = await request.get('/es/settings/subscription', { maxRedirects: 0 })
		expect(guest.status()).toBe(302)
		expect(guest.headers().location).toBe('/es/sign-in?next=%2Fes%2Fsettings%2Fsubscription')
		const returned = await request.get(
			'/es/settings/subscription?checkout_session_id=fixture_checkout&callbackUrl=%2Fes%2Fgames%2Fsudoku',
		)
		expect(returned.status()).toBe(200)
		expect(returned.headers()['cache-control']).toBe('private, no-store')
		expect(returned.headers()['referrer-policy']).toBe('no-referrer')
		const html = await returned.text()
		expect(html).toContain(
			'/es/sign-in?next=%2Fes%2Fsettings%2Fsubscription%3Fcheckout%3Dsuccess%26s%3Dfixture_checkout%26callbackUrl%3D%252Fes%252Fgames%252Fsudoku',
		)
		expect(html).not.toContain('old-fixture-invite')
		const unavailable = await request.get('/settings/subscription', {
			headers: { cookie: `puzzled_session=${fixtureToken}; __Host-puzzled_guest=unavailable` },
		})
		const error = await unavailable.text()
		expect(error).toContain('That did not work.')
		expect(error).not.toContain('Make a new link')
	})

	test('checkout remains pending until Money confirms and the provider clears the browser cookie', async ({
		page,
		context,
		baseURL,
	}) => {
		await context.addCookies([
			{ url: baseURL!, name: 'puzzled_session', value: fixtureToken },
			{ url: baseURL!, name: 'puzzled_checkout_claim', value: 'test-claim', httpOnly: true },
		])
		let releaseClaim!: () => void
		const gate = new Promise<void>((resolve) => {
			releaseClaim = resolve
		})
		await forwardBilling(page)
		await page.route('**/puzzled.v1.BillingService/ClaimCheckout', async (route) => {
			await gate
			await route.fallback()
		})
		await page.goto(
			'/settings/subscription?session_id=fixture_checkout_delayed&callbackUrl=%2Fgames%2Fsudoku',
			{ waitUntil: 'domcontentloaded' },
		)
		await expect(page.getByText('Confirming your subscription.', { exact: false })).toBeVisible()
		await expect(page.getByRole('link', { name: 'Return to puzzle' })).toHaveCount(0)
		releaseClaim()
		await expect(page.getByRole('link', { name: 'Return to puzzle' })).toHaveAttribute(
			'href',
			'/games/sudoku',
		)
		expect(
			(await context.cookies()).some((cookie) => cookie.name === 'puzzled_checkout_claim'),
		).toBe(false)
		const calls = await (await fetch(`${fixture}/__fixture`)).json()
		expect(calls.slice(0, 2)).toEqual([
			{
				method: 'ClaimCheckout',
				body: { checkoutSessionId: 'fixture_checkout_delayed', locale: 'en-US' },
			},
			{
				method: 'GetSubscription',
				body: { refresh: true, checkoutSessionId: 'fixture_checkout_delayed' },
			},
		])
	})

	test('confirmed paid checkout queues one consented Ads conversion and cannot replay on reload', async ({
		page,
		context,
		baseURL,
	}) => {
		const sessionId = 'fixture_checkout_delayed'
		const quoteKey = 'puzzled:ads:checkout-quote'
		const returnPath = `/settings/subscription?session_id=${sessionId}&callbackUrl=%2Fgames%2Fsudoku`
		await context.addCookies([
			{ url: baseURL!, name: 'puzzled_session', value: fixtureToken },
			{ url: baseURL!, name: 'puzzled_checkout_claim', value: 'test-claim', httpOnly: true },
		])
		await page.setExtraHTTPHeaders({ 'CF-IPCountry': 'DE' })
		const googleRequests = await capture(page, false)
		await forwardBilling(page)
		const initial = await page.request.get('/api/consent-context')
		expect((await initial.json()).ids).toEqual({
			ga: 'G-J5P11P794N',
			ads: adsId,
			adsPurchaseLabel: purchaseLabel,
		})
		// Two loopback claim calls settle the fixture; no real order is created.
		const claim = `${fixture}/puzzled.v1.BillingService/ClaimCheckout`
		for (let i = 0; i < 2; i++) {
			const response = await page.request.post(claim, {
				data: { checkoutSessionId: sessionId },
				headers: { cookie: `puzzled_session=${fixtureToken}` },
			})
			expect(await response.json()).toEqual({ claimed: i === 1 })
		}
		await page.addInitScript(
			({ quoteKey }) => {
				localStorage.setItem('puzzled:signal.consent', 'granted')
				// Reseed even on reload: the session marker, not only quote deletion, must deduplicate.
				localStorage.setItem(
					quoteKey,
					JSON.stringify({ plan: 'family_yearly', value: 79.99, currency: 'GBP' }),
				)
			},
			{ quoteKey },
		)
		const conversions = async () =>
			(await commands(page)).filter(
				([command, event]) => command === 'event' && event === 'conversion',
			)
		await page.goto(returnPath)
		await expect(page.getByRole('link', { name: 'Return to puzzle' })).toBeVisible()
		await expect.poll(conversions).toEqual([
			[
				'event',
				'conversion',
				{
					send_to: `${adsId}/${purchaseLabel}`,
					value: 59.99,
					currency: 'GBP',
					transaction_id: 'in_plus_fixture',
				},
			],
		])
		await expect.poll(() => page.evaluate((key) => localStorage.getItem(key), quoteKey)).toBeNull()
		expect(googleRequests).toHaveLength(1)
		await page.reload()
		await expect.poll(() => page.evaluate((key) => localStorage.getItem(key), quoteKey)).toBeNull()
		expect(await conversions()).toEqual([])
		await page.setExtraHTTPHeaders({ 'CF-IPCountry': 'DE', 'Sec-GPC': '1' })
		await page.reload()
		await expect.poll(() => page.evaluate((key) => localStorage.getItem(key), quoteKey)).toBeNull()
		expect(await conversions()).toEqual([])
		expect(googleRequests).toHaveLength(2)
	})

	for (const { name, session, consent, gpc, expected } of [
		{
			name: 'Starter Pass without subscription',
			session: 'fixture_checkout_pass',
			consent: 'granted',
			gpc: false,
			expected: 1,
		},
		{
			name: 'active Plus with a different pending session',
			session: 'fixture_checkout_pending',
			consent: 'granted',
			gpc: false,
			expected: 0,
		},
		{
			name: 'paid return with denied consent',
			session: 'fixture_checkout_pass',
			consent: 'denied',
			gpc: false,
			expected: 0,
		},
		{
			name: 'paid return with GPC',
			session: 'fixture_checkout_pass',
			consent: 'granted',
			gpc: true,
			expected: 0,
		},
	]) {
		test(name, async ({ page, context, baseURL }) => {
			await context.addCookies([{ url: baseURL!, name: 'puzzled_session', value: fixtureToken }])
			await page.setExtraHTTPHeaders({ 'CF-IPCountry': 'DE', ...(gpc ? { 'Sec-GPC': '1' } : {}) })
			const googleRequests = await capture(page, false)
			await forwardBilling(page)
			await page.addInitScript((choice) => {
				localStorage.setItem('puzzled:signal.consent', choice)
				localStorage.setItem(
					'puzzled:ads:checkout-quote',
					JSON.stringify({ plan: 'bogus', value: 999, currency: 'USD' }),
				)
			}, consent)
			await page.goto(`/settings/subscription?session_id=${session}&callbackUrl=%2Fgames%2Fsudoku`)
			await expect(page.getByRole('link', { name: 'Return to puzzle' })).toBeVisible()
			const conversions = async () =>
				(await commands(page)).filter(([cmd, event]) => cmd === 'event' && event === 'conversion')
			if (expected) {
				await expect.poll(conversions).toEqual([
					[
						'event',
						'conversion',
						{
							send_to: `${adsId}/${purchaseLabel}`,
							value: 350,
							currency: 'JPY',
							transaction_id: 'pi_starter_fixture',
						},
					],
				])
			} else if (consent === 'denied' || gpc) {
				await expect
					.poll(() => page.evaluate(() => localStorage.getItem('puzzled:ads:checkout-quote')))
					.toBeNull()
				expect(googleRequests).toEqual([])
				expect(await conversions()).toEqual([])
			} else {
				await expect.poll(() => googleRequests.length).toBe(1)
				expect(await conversions()).toEqual([])
				const calls = await (await fetch(`${fixture}/__fixture`)).json()
				expect(calls).toContainEqual({
					method: 'GetSubscription',
					body: { refresh: true, checkoutSessionId: session },
				})
			}
		})
	}

	test('owner confirms cancellation, resumes, rotates the invite and removes only the intended member', async ({
		page,
		context,
		baseURL,
	}) => {
		await context.addCookies([{ url: baseURL!, name: 'puzzled_session', value: fixtureToken }])
		await forwardBilling(page)
		await page.goto('/settings/subscription')
		await expect(page.getByText('Tryit Family, yearly')).toBeVisible()
		const cancel = page.getByRole('button', { name: 'Cancel subscription' })
		await cancel.click()
		await expect(
			page.getByText('Cancel? You keep Tryit Plus until', { exact: false }),
		).toBeVisible()
		const calls = async () =>
			(await (await fetch(`${fixture}/__fixture`)).json()).filter(
				(call: { method: string }) => call.method !== 'GetSubscription',
			)
		expect(await calls()).toEqual([])
		await cancel.click()
		await expect(page.getByText('Cancelled. Tryit Plus stays open', { exact: false })).toBeVisible()
		await page.getByRole('button', { name: 'Keep my subscription' }).click()
		await expect(page.getByText('Your subscription will renew as before.')).toBeVisible()
		await expect(
			page.getByText('/family/join?code=old-fixture-invite', { exact: false }),
		).toBeVisible()
		await page.getByRole('button', { name: 'Make a new link' }).click()
		await expect(
			page.getByText('/family/join?code=new-fixture-invite', { exact: false }),
		).toBeVisible()
		await expect(
			page.getByText('/family/join?code=old-fixture-invite', { exact: false }),
		).toHaveCount(0)
		await page
			.getByRole('listitem')
			.filter({ hasText: 'Fixture member' })
			.getByRole('button', { name: 'Remove' })
			.click()
		await expect(page.getByText('Fixture member')).toHaveCount(0)
		await expect(page.getByText('Fixture owner', { exact: false })).toBeVisible()
		expect(await calls()).toEqual([
			{ method: 'CancelSubscription', body: {} },
			{ method: 'ResumeSubscription', body: {} },
			{ method: 'ResetFamilyInvite', body: {} },
			{ method: 'RemoveFamilyMember', body: { userId: 'opaque-member' } },
		])
	})
})
