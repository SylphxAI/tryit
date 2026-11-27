import { expect, type Page, test } from '@playwright/test'
import { fixtureToken } from '../scripts/auth-fixture-facts'
import { ENTRY_SURFACE_KEY } from '../src/features/analytics/lib/checkout-entry-surface'
import { CONSENT_VERSION } from '../src/features/analytics/lib/consent'
import { CONSENT_KEY, CONSENT_VERSION_KEY, SIGNAL_STORAGE_KEY } from '../src/lib/storage-keys'

const paid = {
	utm_source: 'launch',
	utm_medium: 'cpc',
	gclid: 'test-google-click',
	fbclid: 'test-meta-click',
}
const nextCampaign = {
	...paid,
	utm_source: 'second',
	gclid: 'test-google-second',
	fbclid: 'test-meta-second',
}
const paidQuery = new URLSearchParams(paid).toString()
const touchKey = `${SIGNAL_STORAGE_KEY}.touch`
const granted = 'granted,granted,granted,granted'
const denied = 'denied,denied,denied,denied'
const metaBrowserId = 'fb.1.1234567890.444'

async function assertTouch(page: Page, touch: typeof paid) {
	await expect
		.poll(() => page.evaluate((key) => JSON.parse(localStorage.getItem(key) ?? 'null'), touchKey))
		.toMatchObject({ touch })
}

async function checkoutHeaders(page: Page, trigger?: string) {
	const button = page.locator('#plus button[data-checkout-trigger]')
	if (trigger) await expect(button).toHaveAttribute('data-checkout-trigger', trigger)
	const [request] = await Promise.all([
		page.waitForRequest('**/puzzled.v1.BillingService/CreateCheckout'),
		button.click(),
	])
	const headers = await request.allHeaders()
	const attribution = headers['x-puzzled-signal-attribution']
	return {
		consent: headers['x-puzzled-signal-consent'],
		surface: headers['x-puzzled-entry-surface'],
		touch:
			attribution === undefined
				? undefined
				: JSON.parse(Buffer.from(attribution, 'base64url').toString('utf8')),
	}
}

async function seedConsent(page: Page, choice = 'granted', version = CONSENT_VERSION, gpc = false) {
	await page.setExtraHTTPHeaders({ 'CF-IPCountry': 'DE', ...(gpc ? { 'Sec-GPC': '1' } : {}) })
	await page.addInitScript(
		({ key, versionKey, choice, version }) => {
			localStorage.setItem(key, choice)
			localStorage.setItem(versionKey, version)
			// Wait for the actual capture pass, even when privacy policy forbids storage.
			window.addEventListener(
				'consent-change',
				() => {
					document.documentElement.dataset.consentReady = 'true'
				},
				{ once: true },
			)
		},
		{ key: CONSENT_KEY, versionKey: CONSENT_VERSION_KEY, choice, version },
	)
}

test.beforeEach(async ({ page, baseURL }) => {
	const origin = new URL(baseURL!)
	expect(['localhost', '127.0.0.1']).toContain(origin.hostname)
	await page.route('**/*', (route) => {
		if (new URL(route.request().url()).origin !== origin.origin) return route.abort()
		return route.continue()
	})
	// Keep the real region/GPC handler but configure no measurement destinations.
	await page.route('**/api/consent-context', async (route) => {
		const response = await route.fetch({ maxRedirects: 0 })
		const { region, gpc } = await response.json()
		await route.fulfill({ response, json: { region, gpc } })
	})
	await page.route('**/v1/guest/session', (route) => route.fulfill({ json: { issued: true } }))
	await page.route('**/puzzled.v1.BillingService/CreateCheckout', (route) => route.abort())
})

for (const { surface, path, selector, identity } of [
	{ surface: 'picks_pill', path: '/es', selector: 'a[data-daily-picks="3"]', identity: 'guest' },
	{ surface: 'stats_banner', path: '/es/stats', selector: '[data-stats-plus-card] a' },
	{
		surface: 'milestone_prompt',
		path: '/es',
		selector: '[aria-labelledby="plus-milestone-title"] a',
		identity: 'member',
	},
]) {
	test(`${surface} keeps both paid click IDs and its entry surface at checkout`, async ({
		page,
		context,
		baseURL,
	}) => {
		if (identity === 'guest') {
			await context.addCookies([
				{
					name: '__Host-puzzled_guest',
					value: 'cap-fixture',
					domain: new URL(baseURL!).hostname,
					path: '/',
					secure: true,
					httpOnly: true,
				},
			])
		} else if (identity === 'member') {
			await context.addCookies([
				{ name: 'puzzled_session', value: fixtureToken, url: baseURL!, httpOnly: true },
			])
		}
		await seedConsent(page)
		await page.goto(`${path}?${paidQuery}`)
		await assertTouch(page, paid)
		const link = page.locator(selector)
		await expect(link).toBeVisible()
		const href = await link.getAttribute('href')
		await link.click()
		await expect(page).toHaveURL(/\/es\/pricing\?/)
		await expect(page.locator('link[rel="canonical"]')).toHaveAttribute('href', /\/es\/pricing$/)
		await expect
			.poll(() => page.evaluate((key) => sessionStorage.getItem(key), ENTRY_SURFACE_KEY))
			.toBe(surface)
		// Check the real wire payload before the href so the old build fails on lost click IDs.
		expect(await checkoutHeaders(page, surface)).toMatchObject({
			consent: granted,
			surface,
			touch: { ...paid, fbc: expect.stringMatching(/\.test-meta-click$/) },
		})
		expect(href).toBe(`/es/pricing?entry_surface=${surface}`)
		await expect(page).toHaveURL(`/es/pricing?entry_surface=${surface}`)
	})
}

for (const { name, choice, version, gpc } of [
	{ name: 'explicit refusal', choice: 'denied' },
	{ name: 'GPC overriding a saved grant', gpc: true },
	{ name: 'an old opt-in consent version', version: '2020-01-01' },
]) {
	test(`${name} does not expose Meta IDs at checkout`, async ({ page, context, baseURL }) => {
		await seedConsent(page, choice, version, gpc)
		await context.addCookies([{ name: '_fbp', value: metaBrowserId, url: baseURL! }])
		await page.goto(`/pricing?${paidQuery}&entry_surface=stats_banner`)
		await expect(page.locator('html')).toHaveAttribute('data-consent-ready', 'true')
		const result = await checkoutHeaders(page, 'stats_banner')
		if (version) {
			expect(result).toMatchObject({
				consent: granted,
				surface: 'stats_banner',
				touch: { gclid: paid.gclid },
			})
			for (const field of ['fbclid', 'fbc', 'fbp']) expect(result.touch).not.toHaveProperty(field)
		} else {
			expect(result).toEqual({ consent: denied, surface: undefined, touch: undefined })
			expect(await page.evaluate((key) => localStorage.getItem(key), touchKey)).toBeNull()
		}
	})
}

test('a genuine second campaign still replaces the checkout touch', async ({
	page,
	context,
	baseURL,
}) => {
	await seedConsent(page)
	await context.addCookies([{ name: '_fbp', value: metaBrowserId, url: baseURL! }])
	await page.goto(`/?${paidQuery}`)
	await assertTouch(page, paid)
	await page.goto(`/pricing?${new URLSearchParams(nextCampaign)}`, {
		referer: 'https://campaign.example/',
	})
	await assertTouch(page, nextCampaign)
	expect(await checkoutHeaders(page)).toMatchObject({
		consent: granted,
		touch: { ...nextCampaign, fbp: metaBrowserId },
	})
})
