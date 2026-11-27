import { expect, type Page, test } from '@playwright/test'
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

async function stageEvents(page: Page) {
	return (await commands(page)).filter(
		(row) => row[1] === 'plus_view' || row[1] === 'upgrade_cta_click',
	)
}

const pricingStage = (origin: string, event: string, plan: string) => [
	'event',
	event,
	{
		send_to: id,
		placement: 'pricing',
		plan,
		page_location: `${origin}/pricing`,
		page_referrer: '',
	},
]

test('GA4 pricing engagement observes a visible quote and a real activation, not checkout', async ({
	page,
}) => {
	await page.route(
		(url) => !['localhost', '127.0.0.1'].includes(url.hostname),
		(route) => route.abort(),
	)
	await capture(page)
	await page.setExtraHTTPHeaders({ 'CF-IPCountry': 'US' })
	await page.setViewportSize({ width: 390, height: 280 })
	await page.route('**/v1/guest/session', (route) => route.fulfill({ json: { issued: true } }))
	let requests = 0
	let releaseFailure!: () => void
	const inFlight = new Promise<void>((resolve) => {
		releaseFailure = resolve
	})
	await page.route('**/puzzled.v1.BillingService/CreateCheckout', async (route) => {
		requests += 1
		expect(route.request().postDataJSON().planId).toBe('individual_once')
		await inFlight
		await route.fulfill({ status: 503, json: { code: 'unavailable', message: 'synthetic' } })
	})
	await page.goto(
		'/pricing?plan=individual_once&gclid=fixture-click&email=fixture%40example.test',
		{
			referer: 'https://source.example.test/path?opaque=fixture',
		},
	)
	const origin = new URL(page.url()).origin
	await expect.poll(async () => (await commands(page)).map((row) => row[1])).toContain('page_view')
	const plus = page.locator('#plus')
	const row = plus.locator('label').filter({ has: page.locator('input[value="once"]') })
	const checkout = plus.locator('button[data-checkout-trigger]')
	await expect(row).not.toBeInViewport({ ratio: 0.5 })
	await expect(checkout).toBeDisabled()
	expect(await stageEvents(page)).toEqual([])
	await row.evaluate((element) => element.scrollIntoView({ block: 'center' }))
	const view = pricingStage(origin, 'plus_view', 'individual_once')
	await expect.poll(() => stageEvents(page)).toEqual([view])
	// The disabled waiver CTA neither dispatches nor starts an RPC.
	await checkout.evaluate((button: HTMLButtonElement) => button.click())
	expect(await stageEvents(page)).toEqual([view])
	expect(requests).toBe(0)
	await plus.getByRole('checkbox').check()
	try {
		await checkout.focus()
		await page.keyboard.press('Enter')
		await expect(checkout).toBeDisabled()
		await page.keyboard.press('Enter')
		await expect.poll(() => requests).toBe(1)
		await expect
			.poll(() => stageEvents(page))
			.toEqual([view, pricingStage(origin, 'upgrade_cta_click', 'individual_once')])
	} finally {
		releaseFailure()
	}
	await expect(plus.getByRole('alert')).toBeVisible()
	expect(
		(await commands(page)).filter((row) =>
			['begin_checkout', 'conversion'].includes(String(row[1])),
		),
	).toEqual([])
	await plus.getByRole('radio', { name: /monthly/i }).check()
	const family = page.locator('#family label').filter({ has: page.locator('input[value="year"]') })
	await family.evaluate((element) => element.scrollIntoView({ block: 'center' }))
	await expect
		.poll(() => stageEvents(page))
		.toEqual([
			view,
			pricingStage(origin, 'upgrade_cta_click', 'individual_once'),
			pricingStage(origin, 'plus_view', 'family_yearly'),
		])
	const originalVisits = await stageEvents(page)
	await page.evaluate(() => {
		const link = document.createElement('a')
		link.href = '/pricing?plan=individual_monthly'
		document.body.append(link)
		link.click()
		link.remove()
	})
	await expect(plus.locator('input[value="month"]')).toBeChecked()
	await plus.locator('input[value="month"]').scrollIntoViewIfNeeded()
	await expect(page).toHaveURL('/pricing?plan=individual_monthly')
	expect(await stageEvents(page)).toEqual(originalVisits)
	await page.locator('header').getByRole('link', { name: 'Tryit', exact: true }).click()
	await expect(page).toHaveURL('/')
	await page.locator('header a[href="/pricing"]').click()
	await expect(page).toHaveURL('/pricing')
	await plus
		.locator('label')
		.filter({ has: page.locator('input[value="year"]') })
		.evaluate((element) => element.scrollIntoView({ block: 'center' }))
	await expect
		.poll(async () => (await stageEvents(page)).at(-1))
		.toEqual(pricingStage(origin, 'plus_view', 'individual_yearly'))
})

test('granting analytics does not replay an earlier pricing view or CTA', async ({ page }) => {
	await page.route(
		(url) => !['localhost', '127.0.0.1'].includes(url.hostname),
		(route) => route.abort(),
	)
	await capture(page)
	await page.setExtraHTTPHeaders({ 'CF-IPCountry': 'DE' })
	await page.setViewportSize({ width: 390, height: 650 })
	await page.route('**/v1/guest/session', (route) => route.fulfill({ json: { issued: true } }))
	await page.route('**/puzzled.v1.BillingService/CreateCheckout', (route) =>
		route.fulfill({ status: 503, json: { code: 'unavailable', message: 'synthetic' } }),
	)
	await page.goto('/pricing')
	const consent = page
		.locator('[data-consent-banner]')
		.getByRole('button', { name: 'Analytics only' })
	await expect(consent).toBeVisible()
	const plus = page.locator('#plus')
	const row = plus.locator('label').filter({ has: page.locator('input[value="year"]') })
	await row.evaluate((element) => element.scrollIntoView({ block: 'center' }))
	await expect(row).toBeInViewport({ ratio: 0.5 })
	const checkout = plus.locator('button[data-checkout-trigger]')
	await checkout.press('Enter')
	await expect(plus.getByRole('alert')).toBeVisible()
	expect(await stageEvents(page)).toEqual([])
	await consent.click()
	await expect.poll(async () => (await commands(page)).map((row) => row[1])).toContain('page_view')
	await plus.getByRole('radio', { name: /monthly/i }).check()
	await plus.locator('button[data-checkout-trigger]').press('Enter')
	await expect(plus.getByRole('alert')).toBeVisible()
	expect(await stageEvents(page)).toEqual([
		pricingStage(new URL(page.url()).origin, 'upgrade_cta_click', 'individual_monthly'),
	])
})
