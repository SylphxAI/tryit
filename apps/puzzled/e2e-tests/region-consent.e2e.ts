import { expect, type Page, test } from '@playwright/test'

import { capture, commands, id } from './google-tag-support'

const key = 'puzzled:signal.consent'
const denied = {
	analytics_storage: 'denied',
	ad_storage: 'denied',
	ad_user_data: 'denied',
	ad_personalization: 'denied',
}

const full = {
	analytics_storage: 'granted',
	ad_storage: 'granted',
	ad_user_data: 'granted',
	ad_personalization: 'granted',
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
				const buttons = [...el.querySelectorAll('button')]
				const nav = document.querySelector('nav.fixed')?.getBoundingClientRect()
				const bar = el.getBoundingClientRect()
				const boxes = buttons.map((button) => button.getBoundingClientRect())
				return {
					height: bar.height,
					bottom: bar.bottom,
					viewportBottom: window.innerHeight,
					navTop: nav?.height ? nav.top : null,
					choices: buttons.map((button) => button.textContent?.trim()),
					buttonHeight: Math.min(...boxes.map((box) => box.height)),
					buttonWidthDifference:
						Math.max(...boxes.map((box) => box.width)) - Math.min(...boxes.map((box) => box.width)),
					rowSpread:
						Math.max(...boxes.map((box) => box.top)) - Math.min(...boxes.map((box) => box.top)),
					equalStyle: new Set(buttons.map((button) => button.className)).size === 1,
				}
			})
			const mobile = viewport.width < 768
			expect(metric.height).toBeLessThanOrEqual(mobile ? 83 : 60)
			if (mobile) expect(metric.navTop).not.toBeNull()
			else expect(metric.navTop).toBeNull()
			expect(metric.bottom).toBeCloseTo(metric.navTop ?? metric.viewportBottom, 0)
			expect(metric.choices).toEqual(['Decline', 'Analytics only', 'Accept'])
			expect(metric.equalStyle).toBe(true)
			expect(metric.buttonHeight).toBeGreaterThanOrEqual(44)
			expect(metric.buttonWidthDifference).toBeLessThan(1)
			expect(metric.rowSpread).toBeLessThan(1)
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
			expect(await page.evaluate((key) => localStorage.getItem(key), key)).toBe('granted')
			await expect.poll(() => requests.length).toBe(1)
			await expect(banner(page)).toBeHidden()
			const data = await commands(page)
			expect(data).toContainEqual(['consent', 'update', full])
			expect(data).toContainEqual([
				'event',
				'page_view',
				{
					send_to: id,
					page_location: `${new URL(page.url()).origin}/`,
					page_title: 'Free Daily Brain Games & Puzzles | Tryit',
					page_referrer: '',
				},
			])
			expect(JSON.stringify(data)).not.toContain('private')
			await page.goto('/games/sudoku?gameId=secret')
			await expect.poll(() => commands(page)).toContainEqual(['consent', 'default', denied])
			expect(requests).toHaveLength(1)
			expect(JSON.stringify(await commands(page))).not.toContain('sudoku')
		})

		test('non-EEA defaults to analytics and advertising; withdrawal stops the tag and persists in either region', async ({
			page,
			context,
		}) => {
			const requests = await capture(page)
			await page.setExtraHTTPHeaders({ 'CF-IPCountry': 'US' })
			await page.goto('/')
			await expect.poll(() => requests.length).toBe(1)
			await expect(banner(page)).toBeHidden()
			expect(await commands(page)).toContainEqual(['consent', 'default', full])
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
			expect(await page.evaluate((key) => localStorage.getItem(key), key)).toBe('denied')
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
						localStorage.setItem(key, 'granted')
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
		['US', 'ROW'],
		['US, US', 'EEA'],
		['XX', 'EEA'],
		['', 'EEA'],
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
	expect(await page.evaluate((key) => localStorage.getItem(key), key)).toBe('denied')
	await page.reload()
	await expect.poll(() => commands(page)).toContainEqual(['consent', 'default', denied])
	await expect(banner(page)).toBeHidden()
	expect(requests).toEqual([])
})

test('late consent leaves the cold Nonogram LCP on game content', async ({ page, browserName }) => {
	test.skip(browserName !== 'chromium', 'Largest Contentful Paint entries require Chromium here')
	await page.setViewportSize({ width: 412, height: 823 })
	await page.setExtraHTTPHeaders({ 'CF-IPCountry': 'DE' })
	await page.addInitScript(() => {
		const lcp = { count: 0, inBanner: false }
		Object.defineProperty(window, 'consentLcpProbe', { value: lcp })
		new PerformanceObserver((list) => {
			for (const entry of list.getEntries() as LargestContentfulPaint[]) {
				if (entry.element?.closest('main')) lcp.count++
				if (entry.element?.closest('[data-consent-banner]')) lcp.inBanner = true
			}
		}).observe({ type: 'largest-contentful-paint', buffered: true })
	})
	const held = Promise.withResolvers<void>()
	const requested = Promise.withResolvers<void>()
	await page.route('**/api/consent-context', async (route) => {
		requested.resolve()
		await held.promise
		await route.continue()
	})
	const lcp = () =>
		page.evaluate(
			() => Reflect.get(window, 'consentLcpProbe') as { count: number; inBanner: boolean },
		)
	try {
		await page.goto('/games/nonogram', { waitUntil: 'domcontentloaded' })
		await requested.promise
		await expect.poll(async () => (await lcp()).count).toBeGreaterThan(0)
		await expect(banner(page)).toBeHidden()
	} finally {
		held.resolve()
	}
	await expect(banner(page).getByRole('button')).toHaveCount(3)
	await expect(banner(page).getByRole('link', { name: 'Privacy policy' })).toBeVisible()
	// Let Chromium paint the revealed notice and deliver any new entry before the first input.
	await page.evaluate(
		() =>
			new Promise<void>((resolve) =>
				requestAnimationFrame(() => requestAnimationFrame(() => setTimeout(resolve, 0))),
			),
	)
	expect((await lcp()).inBanner).toBe(false)
})

// A fake dataLayer consumer cannot reproduce the destination's startup hit.
// Fetch only the public script; intercept every cross-origin browser request
// before it reaches Google (including POST batches and beacon transports).
test.describe('GA4 collector', () => {
	test.use({ bypassCSP: true, serviceWorkers: 'block' })
	const measurementId = 'G-J5P11P794N'
	const script = `https://www.googletagmanager.com/gtag/js?id=${measurementId}`
	const windowMs = 7000 // The existing duplicate arrived about 5s after the first hit.

	async function intercept(page: Page, origin: string, loadScript: () => Promise<string>) {
		let loads = 0
		const events: URLSearchParams[] = []
		await page.context().route('**/*', async (route) => {
			const next = route.request()
			const url = new URL(next.url())
			if (url.origin === origin) return route.continue()
			if (url.href === script) {
				loads++
				return route.fulfill({ contentType: 'application/javascript', body: await loadScript() })
			}
			if (url.pathname.endsWith('/collect')) {
				for (const line of (next.postData() ?? '').split('\n')) {
					const params = new URLSearchParams(url.search)
					for (const [key, value] of new URLSearchParams(line)) params.set(key, value)
					events.push(params)
				}
			}
			return route.fulfill({ status: 204 })
		})
		await page.route('**/api/consent-context', async (route) => {
			const response = await route.fetch()
			await route.fulfill({
				response,
				json: { ...(await response.json()), ids: { ga: measurementId, ads: null } },
			})
		})
		return {
			loads: () => loads,
			events,
			views: () =>
				events
					.filter((event) => event.get('en') === 'page_view')
					.map((event) => ({
						title: event.get('dt'),
						location: event.get('dl'),
					})),
		}
	}

	test('EEA Accept sends one canonical page view, then one per committed public SPA route', async ({
		page,
		request,
		baseURL,
	}) => {
		const origin = new URL(baseURL!).origin
		const loaded = await request.get(script, { timeout: 15000 })
		expect(loaded.ok()).toBe(true)
		const source = await loaded.text()
		const collector = await intercept(page, origin, async () => source)
		await page.setExtraHTTPHeaders({ 'CF-IPCountry': 'DE' })
		await page.goto('/?q=synthetic-search#synthetic-fragment')
		await expect(banner(page)).toBeVisible()
		await expect.poll(() => commands(page)).toContainEqual(['consent', 'default', denied])
		expect(collector.loads()).toBe(0)
		expect(collector.events).toEqual([])

		const home = { title: 'Free Daily Brain Games & Puzzles | Tryit', location: `${origin}/` }
		await banner(page).getByRole('button', { name: 'Accept', exact: true }).click()
		await expect.poll(collector.views, { timeout: 12000 }).toContainEqual(home)
		await page.waitForTimeout(windowMs)
		expect(collector.loads()).toBe(1)
		expect(collector.views()).toEqual([home])

		// The real footer link must keep the same document to test SPA tracking.
		await page.evaluate(() => {
			document.documentElement.dataset.ga4SpaTest = 'same'
		})
		await page.locator('a[href="/privacy"]').first().click()
		await expect(page).toHaveURL(`${origin}/privacy`)
		await expect(page.locator('html')).toHaveAttribute('data-ga4-spa-test', 'same')
		await expect(page).toHaveTitle('Privacy Policy | Tryit')
		const privacy = { title: 'Privacy Policy | Tryit', location: `${origin}/privacy` }
		await expect.poll(collector.views, { timeout: 12000 }).toContainEqual(privacy)
		await page.waitForTimeout(windowMs)
		expect(collector.loads()).toBe(1)
		expect(collector.views()).toEqual([home, privacy])
		expect(collector.events.some((event) => event.get('en') === 'view_search_results')).toBe(false)
		expect(collector.events.map((event) => event.toString()).join(' ')).not.toMatch(
			/synthetic-search|synthetic-fragment/,
		)
	})

	test('GPC does not load the script or reach the collector despite a stored grant', async ({
		page,
		baseURL,
	}) => {
		const collector = await intercept(page, new URL(baseURL!).origin, async () => '')
		await page.setExtraHTTPHeaders({ 'CF-IPCountry': 'US', 'Sec-GPC': '1' })
		await page.addInitScript((consentKey) => localStorage.setItem(consentKey, 'granted'), key)
		await page.goto('/')
		await expect.poll(() => commands(page)).toContainEqual(['consent', 'default', denied])
		await expect(banner(page)).toBeHidden()
		expect(collector.loads()).toBe(0)
		expect(collector.events).toEqual([])
	})
})
