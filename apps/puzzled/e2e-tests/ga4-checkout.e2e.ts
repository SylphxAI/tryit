import { expect, test } from '@playwright/test'
import { CONSENT_KEY } from '../src/lib/storage-keys'
import { capture, commands, id } from './google-tag-support'

const snapshotKey = 'fixture-tag-commands'

for (const { consent, gpc, entry, surface } of [
	{ consent: null, gpc: false, entry: 'seo_vs-nyt-games', surface: 'seo_vs-nyt-games' },
	{ consent: 'accepted', gpc: false, entry: 'private_person_5551234', surface: 'pricing_card' },
	{ consent: 'declined', gpc: false, entry: 'seo_vs-nyt-games', surface: 'pricing_card' },
	{ consent: 'accepted', gpc: true, entry: 'seo_vs-nyt-games', surface: 'pricing_card' },
] as const) {
	test(`checkout handoff: ${gpc ? 'GPC' : (consent ?? 'non-EEA default')}`, async ({
		page,
		context,
		baseURL,
	}) => {
		await capture(page)
		const granted = consent === 'accepted' && !gpc
		await page.setExtraHTTPHeaders({ 'CF-IPCountry': 'US', ...(gpc ? { 'Sec-GPC': '1' } : {}) })
		const origin = baseURL ?? 'http://localhost:3000'
		await context.addCookies([{ name: '_ga', value: 'GA1.1.12345.67890', url: origin }])
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
		let failCheckout = granted
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
		const contextReady = page.waitForResponse('**/api/consent-context')
		await page.goto(
			`/pricing?${new URLSearchParams({ entry_surface: entry, email: 'fixture@example.test' })}`,
		)
		await contextReady
		const begin = (rows: unknown[][]) => rows.filter((row) => row[1] === 'begin_checkout')
		if (consent !== 'declined' && !gpc) {
			await expect
				.poll(async () => (await commands(page)).map((row) => row[1]))
				.toContain('page_view')
		}
		const button = page.locator('#plus').getByRole('button', { name: 'Continue to payment' })
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
								entry_surface: 'pricing_card',
							}),
						],
					]
				: [],
		)
		expect(checkoutRequests).toHaveLength(granted ? 2 : 1)
		for (const headers of checkoutRequests) {
			expect(headers['x-puzzled-entry-surface']).toBe(surface)
			expect(headers['x-puzzled-analytics-storage']).toBe(granted ? 'granted' : undefined)
		}
		if (granted) expect(JSON.stringify(rows)).not.toContain(entry)
	})
}
