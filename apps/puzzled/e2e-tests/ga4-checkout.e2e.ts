import { expect, test } from '@playwright/test'
import { CONSENT_KEY } from '../src/lib/storage-keys'
import { capture, commands, id } from './google-tag-support'

const snapshotKey = 'fixture-tag-commands'

for (const consent of [null, 'accepted', 'declined'] as const) {
	test(`checkout handoff with consent ${consent ?? 'non-EEA default'}`, async ({ page }) => {
		await capture(page)
		await page.setExtraHTTPHeaders({ 'CF-IPCountry': 'US' })
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
		let failCheckout = consent === 'accepted'
		await page.route('**/puzzled.v1.BillingService/CreateCheckout', (route) =>
			failCheckout
				? route.fulfill({ status: 503, json: { code: 'unavailable', message: 'synthetic error' } })
				: route.fulfill({ json: { url: `${new URL(page.url()).origin}/__fixture-checkout` } }),
		)
		const entry = consent === 'accepted' ? 'untrusted-name-and-phone-5551234' : 'vs-nyt-games'
		const contextReady = page.waitForResponse('**/api/consent-context')
		await page.goto(`/pricing?entry_surface=${entry}`)
		await contextReady
		const begin = (rows: unknown[][]) => rows.filter((row) => row[1] === 'begin_checkout')
		if (consent !== 'declined') {
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
			consent === 'accepted'
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
		expect(JSON.stringify(rows)).not.toContain(entry)
	})
}
