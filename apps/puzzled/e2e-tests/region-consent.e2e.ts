import { expect, type Page, test } from '@playwright/test'

const id = 'G-TEST1234'
const key = 'puzzled:consent:cookie'
const denied = {
	analytics_storage: 'denied',
	ad_storage: 'denied',
	ad_user_data: 'denied',
	ad_personalization: 'denied',
}

async function capture(page: Page) {
	const requests: string[] = []
	await page.route(
		/https:\/\/[^/]*(googletagmanager\.com|google-analytics\.com|analytics\.google\.com|googleadservices\.com|googlesyndication\.com|doubleclick\.net)\//,
		(route) => {
			requests.push(route.request().url())
			return route.fulfill({
				contentType: 'application/javascript',
				body: '/* test stub, no external traffic */',
			})
		},
	)
	// Exercise the real endpoint and middleware; inject only a fake destination so
	// both CI and production-build verification work without measurement secrets.
	await page.route('**/api/consent-context', async (route) => {
		const response = await route.fetch()
		await route.fulfill({
			response,
			json: { ...(await response.json()), ids: { ga: id, ads: 'AW-123456789' } },
		})
	})
	return requests
}

function commands(page: Page) {
	return page.evaluate(() =>
		((window as Window & { dataLayer?: Array<ArrayLike<unknown>> }).dataLayer ?? []).map((entry) =>
			Array.from(entry),
		),
	)
}

const banner = (page: Page) => page.locator('[data-consent-banner]')
const settings = async (page: Page) => {
	await page.getByRole('button', { name: 'Cookie settings', exact: true }).click()
	const dialog = page.getByRole('dialog', { name: 'Cookie settings' })
	await expect(dialog).toBeVisible()
	return dialog
}

for (const viewport of [
	{ width: 1440, height: 900 },
	{ width: 390, height: 844 },
]) {
	test.describe(`${viewport.width}x${viewport.height}`, () => {
		test.use({ viewport })

		test('EEA keeps all Google signals denied until Accept; equal actions and clear CTA/footer', async ({
			page,
			context,
		}) => {
			const requests = await capture(page)
			await page.setExtraHTTPHeaders({ 'CF-IPCountry': 'DE' })
			await page.goto('/?email=private%40example.test&gclid=private-ad')
			await expect(banner(page)).toBeVisible()
			await expect.poll(() => commands(page)).toContainEqual(['consent', 'default', denied])
			expect(requests).toHaveLength(0)
			expect((await context.cookies()).some(({ name }) => name.startsWith('_ga'))).toBe(false)
			await expect(page.locator('head link[rel="manifest"]')).toHaveAttribute(
				'href',
				'/manifest.webmanifest',
			)
			expect((await page.request.get('/manifest.webmanifest')).status()).toBe(200)
			const metric = await banner(page).evaluate((el) => {
				const [decline, accept] = [...el.querySelectorAll('button')]
				const height = el.getBoundingClientRect().height
				return {
					height,
					decline: decline.getBoundingClientRect().height,
					accept: accept.getBoundingClientRect().height,
					equal: decline.className === accept.className,
				}
			})
			expect(metric.height).toBeLessThanOrEqual(viewport.width < 768 ? 105 : 63)
			expect(metric.equal).toBe(true)
			expect(Math.min(metric.decline, metric.accept)).toBeGreaterThanOrEqual(44)
			for (const target of [
				page.locator('[data-day-primary-action]'),
				page.getByRole('button', { name: 'Cookie settings', exact: true }),
			]) {
				await target.evaluate((el) => el.scrollIntoView({ block: 'end' }))
				await expect
					.poll(() =>
						target.evaluate((el) => {
							const r = el.getBoundingClientRect()
							const b = document.querySelector('[data-consent-banner]')!.getBoundingClientRect()
							return {
								overlap:
									Math.max(0, Math.min(r.right, b.right) - Math.max(r.left, b.left)) *
									Math.max(0, Math.min(r.bottom, b.bottom) - Math.max(r.top, b.top)),
								directHit: el.contains(
									document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2),
								),
							}
						}),
					)
					.toEqual({ overlap: 0, directHit: true })
			}
			console.log(
				`consent ${viewport.width}x${viewport.height}: ${JSON.stringify(metric)} CTA/footer overlap=0 directHit=true`,
			)
			await banner(page).getByRole('button', { name: 'Accept', exact: true }).click()
			await expect.poll(() => requests.length).toBe(1)
			await expect(banner(page)).toBeHidden()
			const data = await commands(page)
			expect(data).toContainEqual([
				'consent',
				'update',
				{ ...denied, analytics_storage: 'granted' },
			])
			expect(data).toContainEqual([
				'event',
				'page_view',
				{ send_to: id, page_location: `${new URL(page.url()).origin}/`, page_title: 'Tryit' },
			])
			expect(JSON.stringify(data)).not.toContain('private')
			await page.goto('/games/sudoku?gameId=secret')
			await expect.poll(() => commands(page)).toContainEqual(['consent', 'default', denied])
			expect(requests).toHaveLength(1)
			expect(JSON.stringify(await commands(page))).not.toContain('sudoku')
		})

		test('non-EEA defaults to analytics only; withdrawal stops the tag and persists in either region', async ({
			page,
			context,
		}) => {
			const requests = await capture(page)
			await page.setExtraHTTPHeaders({ 'CF-IPCountry': 'US' })
			await page.goto('/')
			await expect.poll(() => requests.length).toBe(1)
			await expect(banner(page)).toBeHidden()
			expect(await commands(page)).toContainEqual([
				'consent',
				'default',
				{ ...denied, analytics_storage: 'granted' },
			])
			await context.addCookies([{ name: '_ga', value: 'host', url: new URL(page.url()).origin }])
			const domain = new URL(page.url()).hostname
			if (domain.endsWith('.lvh.me'))
				await context.addCookies([
					{ name: '_ga_PARENT', value: 'parent', domain: '.lvh.me', path: '/' },
				])
			const dialog = await settings(page)
			await dialog.getByRole('button', { name: 'Decline', exact: true }).click()
			expect(await page.evaluate((id) => Reflect.get(window, `ga-disable-${id}`), id)).toBe(true)
			expect(await commands(page)).toContainEqual(['consent', 'update', denied])
			expect((await context.cookies()).filter(({ name }) => name.startsWith('_ga'))).toEqual([])
			expect(await page.evaluate((key) => localStorage.getItem(key), key)).toBe('declined')
			for (const region of ['US', 'DE']) {
				await page.setExtraHTTPHeaders({ 'CF-IPCountry': region })
				await page.reload()
				await expect.poll(() => commands(page)).toContainEqual(['consent', 'default', denied])
				await expect(banner(page)).toBeHidden()
			}
			expect(requests).toHaveLength(1)
		})

		for (const signal of ['header', 'browser'] as const) {
			test(`${signal} GPC overrides stored analytics and ads grants`, async ({ page }) => {
				const requests = await capture(page)
				await page.setExtraHTTPHeaders({
					'CF-IPCountry': 'HK',
					...(signal === 'header' ? { 'Sec-GPC': '1' } : {}),
				})
				await page.addInitScript(
					({ key, signal }) => {
						localStorage.setItem(key, 'accepted')
						localStorage.setItem('puzzled:consent:marketing', 'accepted')
						if (signal === 'browser')
							Object.defineProperty(navigator, 'globalPrivacyControl', { value: true })
					},
					{ key, signal },
				)
				await page.goto('/')
				await expect.poll(() => commands(page)).toContainEqual(['consent', 'default', denied])
				await expect(banner(page)).toBeHidden()
				const dialog = await settings(page)
				await expect(dialog.getByRole('status')).toContainText(
					'Global Privacy Control (GPC) is active',
				)
				await expect(dialog.getByRole('button', { name: 'Accept', exact: true })).toHaveCount(0)
				expect(requests).toHaveLength(0)
			})
		}
	})
}

test('context is private no-store, only reads the CF header and never varies page HTML by region', async ({
	request,
}) => {
	for (const [country, expected] of [
		['US', 'non-eea'],
		['US, US', 'eea'],
		['XX', 'eea'],
		['', 'eea'],
	]) {
		const headers = {
			...(country ? { 'CF-IPCountry': country } : {}),
			'Accept-Language': 'en-US',
			'Sec-GPC': '1',
		}
		const response = await request.get('/api/consent-context', { headers })
		expect(response.headers()['cache-control']).toBe('private, no-store')
		expect(await response.json()).toMatchObject({ region: expected, gpc: true })
		const page = await request.get('/', { headers })
		expect(page.headers().vary ?? '').not.toMatch(/cf-ipcountry|sec-gpc/i)
		expect(await page.text()).not.toContain('googletagmanager.com/gtag/js')
	}
})

test('mobile opt-in bar fits every supported locale and Decline does not load Google', async ({
	page,
}) => {
	const requests = await capture(page)
	await page.setViewportSize({ width: 390, height: 844 })
	for (const locale of ['', 'en-GB', 'es', 'ja', 'pt-BR', 'zh-CN', 'zh-HK', 'zh-TW']) {
		await page.goto(`/${locale}`)
		await expect(banner(page)).toBeVisible()
		expect((await banner(page).boundingBox())!.height, locale || 'en-US').toBeLessThanOrEqual(105)
	}
	await page.goto('/')
	await banner(page).getByRole('button', { name: 'Decline', exact: true }).click()
	await expect(banner(page)).toBeHidden()
	await page.reload()
	await expect.poll(() => commands(page)).toContainEqual(['consent', 'default', denied])
	await expect(banner(page)).toBeHidden()
	expect(requests).toEqual([])
})
