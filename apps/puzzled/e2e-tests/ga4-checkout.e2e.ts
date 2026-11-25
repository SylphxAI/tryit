import { expect, test } from '@playwright/test'
import { CONSENT_KEY } from '../src/lib/storage-keys'
import { capture, commands, id } from './google-tag-support'

const snapshotKey = 'fixture-tag-commands'

test.afterEach(async ({ page }) => {
	// The destination can still be starting ConsentRuntime when the checkout assertions finish.
	await page.unrouteAll({ behavior: 'ignoreErrors' })
})

for (const [country, consent, gpc, entry, expected] of [
	['US', null, false, 'seo_vs-nyt-games', 'full'],
	['CA', null, false, 'seo_vs-nyt-games', 'full'],
	['AU', null, false, 'seo_vs-nyt-games', 'full'],
	['DE', null, false, 'seo_vs-nyt-games', 'denied'],
	['GB', null, false, 'seo_vs-nyt-games', 'denied'],
	['CH', null, false, 'seo_vs-nyt-games', 'denied'],
	['XX', null, false, 'seo_vs-nyt-games', 'denied'],
	['US', 'analytics_only', false, 'private_person_5551234', 'analytics'],
	['US', 'denied', false, 'seo_vs-nyt-games', 'denied'],
	['US', 'granted', true, 'seo_vs-nyt-games', 'denied'],
] as const) {
	test(`checkout handoff: ${country} / ${gpc ? 'GPC' : (consent ?? 'default')}`, async ({
		page,
		context,
		baseURL,
	}) => {
		await capture(page)
		const granted = expected !== 'denied'
		const surface = granted ? (entry === 'seo_vs-nyt-games' ? entry : 'pricing_card') : undefined
		await page.setExtraHTTPHeaders({ 'CF-IPCountry': country, ...(gpc ? { 'Sec-GPC': '1' } : {}) })
		const origin = baseURL ?? 'http://localhost:3000'
		await context.addCookies([
			{ name: '_ga', value: 'GA1.1.12345.67890', url: origin },
			{ name: 'puzzled_currency', value: 'usd', url: origin },
		])
		await page.addInitScript(
			({ consent, key }) => {
				if (consent) localStorage.setItem(key, consent)
			},
			{ consent, key: CONSENT_KEY },
		)
		await page.route('**/v1/guest/session', (route) => route.fulfill({ json: { issued: true } }))
		await page.route('**/__fixture-checkout', (route) =>
			route.fulfill({ body: 'Synthetic payment page' }),
		)
		let failCheckout = expected === 'analytics'
		const checkoutRequests: Record<string, string>[] = []
		await page.route('**/puzzled.v1.BillingService/CreateCheckout', async (route) => {
			checkoutRequests.push(await route.request().allHeaders())
			expect(route.request().postDataJSON()).toEqual({
				planId: 'individual_yearly',
				locale: 'en-US',
				currency: 'usd',
			})
			return failCheckout
				? route.fulfill({
						status: 503,
						json: { code: 'unavailable', message: 'synthetic error' },
					})
				: route.fulfill({ json: { url: `${origin}/__fixture-checkout` } })
		})
		await page.goto(
			'/pricing?' +
				new URLSearchParams({
					entry_surface: entry,
					email: 'fixture@example.test',
					utm_source: 'fixture',
					gclid: 'click_1',
				}),
		)
		// Full navigations emulate the auth round trip without making a real account or payment.
		await expect.poll(() => commands(page)).not.toEqual([])
		if (granted) {
			await page.goto('/sign-in?nextUrl=%2Fpricing')
			await page.goto('/pricing')
			await expect.poll(() => commands(page)).not.toEqual([])
		}
		const begin = (rows: unknown[][]) => rows.filter((row) => row[1] === 'begin_checkout')
		if (granted) {
			await expect
				.poll(async () => (await commands(page)).map((row) => row[1]))
				.toContain('page_view')
		}
		const button = page
			.locator('#plus')
			.getByRole('button', { name: /^(Start Tryit Plus|Continue to payment)$/ })
		if (failCheckout) {
			await button.click()
			await expect(page.locator('#plus').getByRole('alert')).toBeVisible()
			expect(begin(await commands(page))).toEqual([])
			failCheckout = false
		}
		// Preserve the checkout document's outbound commands across its full navigation.
		await page.evaluate((key) => {
			window.addEventListener('pagehide', () => {
				const layer = (window as Window & { dataLayer?: Array<ArrayLike<unknown>> }).dataLayer ?? []
				sessionStorage.setItem(key, JSON.stringify(layer.map((entry) => Array.from(entry))))
			})
		}, snapshotKey)
		await button.click()
		await expect(page).toHaveURL('/__fixture-checkout')
		const rows = await page.evaluate(
			(key) => JSON.parse(sessionStorage.getItem(key) ?? 'null'),
			snapshotKey,
		)
		expect(begin(rows)).toEqual(
			granted
				? [
						[
							'event',
							'begin_checkout',
							expect.objectContaining({
								send_to: id,
								value: 39.99,
								currency: 'USD',
								entry_surface: surface,
							}),
						],
					]
				: [],
		)
		expect(checkoutRequests).toHaveLength(expected === 'analytics' ? 2 : 1)
		for (const headers of checkoutRequests) {
			expect(headers['x-puzzled-entry-surface']).toBe(surface)
			const bits =
				expected === 'full'
					? 'granted,granted,granted,granted'
					: expected === 'analytics'
						? 'granted,denied,denied,denied'
						: 'denied,denied,denied,denied'
			expect(headers['x-puzzled-signal-consent']).toBe(bits)
			const encoded = headers['x-puzzled-signal-attribution']
			if (!granted) expect(encoded).toBeUndefined()
			else {
				const fields = JSON.parse(Buffer.from(encoded ?? '', 'base64url').toString('utf8'))
				expect(fields).toMatchObject({ utm_source: 'fixture', ga_client_id: '12345.67890' })
				expect(fields.gclid).toBe(expected === 'full' ? 'click_1' : undefined)
				expect(JSON.stringify(fields)).not.toContain('fixture@example.test')
			}
		}
		expect(JSON.stringify(rows)).not.toContain('private_person_5551234')
	})
}
