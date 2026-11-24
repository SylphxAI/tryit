import { expect, test } from '@playwright/test'
import catalogue from '../../../config/commercial/catalogue.json'

for (const { path, locale, currency } of [
	{ path: '/', locale: 'en-US', currency: 'usd' },
	{ path: '/en-GB', locale: 'en-GB', currency: 'gbp' },
]) {
	test(`${path} publishes the application, configured offers and operator in rendered JSON-LD`, async ({
		page,
	}) => {
		const response = await page.goto(path)
		expect(response?.status()).toBe(200)
		const schemas = (
			await page.locator('script[type="application/ld+json"]').allTextContents()
		).map((text) => JSON.parse(text))
		const apps = schemas.filter((schema) => schema['@type'] === 'WebApplication')
		expect(apps).toHaveLength(1)
		const app = apps[0]
		expect(app).toMatchObject({
			'@context': 'https://schema.org',
			name: 'Tryit',
			applicationCategory: 'GameApplication',
			operatingSystem: 'Any',
			publisher: {
				'@type': 'Organization',
				name: 'Sylphx Limited',
				url: 'https://sylphx.com',
			},
		})
		expect(app.offers).toEqual([
			{
				'@type': 'Offer',
				name: 'Free daily puzzles',
				price: '0.00',
				priceCurrency: currency.toUpperCase(),
				url: app.url,
			},
			...catalogue.plans
				.filter((plan) => plan.interval === 'month' || plan.interval === 'year')
				.map((plan) => {
					const price = ((plan.unit_amounts as Record<string, number>)[currency] / 100).toFixed(2)
					return {
						'@type': 'Offer',
						name: (plan.name as Record<string, string>)[locale] ?? plan.name['en-US'],
						price,
						priceCurrency: currency.toUpperCase(),
						url: `${app.url}/pricing`,
						priceSpecification: {
							'@type': 'UnitPriceSpecification',
							price,
							priceCurrency: currency.toUpperCase(),
							billingDuration: plan.interval === 'month' ? 'P1M' : 'P1Y',
							valueAddedTaxIncluded: true,
						},
					}
				}),
		])
		const organization = schemas.find((schema) => schema['@type'] === 'Organization')
		expect(organization).toMatchObject({
			name: 'Tryit',
			url: app.url,
			parentOrganization: {
				'@type': 'Organization',
				name: 'Sylphx Limited',
				url: 'https://sylphx.com',
				identifier: '16438428',
			},
			contactPoint: {
				'@type': 'ContactPoint',
				email: 'hi@tryit.fun',
				telephone: '+447537188188',
				contactType: 'customer support',
			},
		})
		expect(organization.contactPoint.telephone).toMatch(/^\+[1-9]\d{1,14}$/)
		expect(JSON.stringify(schemas)).not.toMatch(/16686526|Shelton Street/)
	})
}

for (const path of ['/terms', '/privacy']) {
	test(`${path} renders the registered company and usable contact links`, async ({ page }) => {
		const response = await page.goto(path)
		expect(response?.status()).toBe(200)
		const main = page.getByRole('main')
		const text = await main.textContent()
		expect(text).toContain('Sylphx Limited')
		expect(text).toContain('16438428')
		expect(text).toContain('England and Wales')
		// Same registered office, in the postal order already used by the legal pages.
		expect(text).toContain('128 City Road, London EC1V 2NX, United Kingdom')
		expect(text).not.toMatch(/16686526|Shelton Street/)
		await expect(main.locator('a[href="mailto:legal@sylphx.com"]')).toHaveText('legal@sylphx.com')
		await expect(main.locator('a[href="tel:+447537188188"]')).toHaveText('+44 7537 188 188')
	})
}

test('the sitemap index serves one canonical XML URL set per locale', async ({ page, request }) => {
	const sitemapNamespace = 'http://www.sitemaps.org/schemas/sitemap/0.9'
	const xhtmlNamespace = 'http://www.w3.org/1999/xhtml'
	const locales = ['en-US', 'en-GB', 'zh-HK', 'zh-TW', 'zh-CN', 'ja', 'es', 'pt-BR']
	const getXml = async (path: string, root: 'sitemapindex' | 'urlset') => {
		const response = await request.get(path, {
			maxRedirects: 0,
			headers: { cookie: 'NEXT_LOCALE=es; sylphx_identity_session=ignored-fixture' },
		})
		expect(response.status(), path).toBe(200)
		expect(response.headers()['content-type']).toBe('application/xml; charset=utf-8')
		expect(response.headers()['cache-control']).toBe('public, max-age=3600')
		expect(response.headers()['set-cookie']).toBeUndefined()
		return page.evaluate(
			({ xml, root, sitemapNamespace, xhtmlNamespace }) => {
				const doc = new DOMParser().parseFromString(xml, 'application/xml')
				if (
					doc.querySelector('parsererror') ||
					doc.documentElement.localName !== root ||
					doc.documentElement.namespaceURI !== sitemapNamespace ||
					doc.getElementsByTagNameNS(sitemapNamespace, 'lastmod').length
				) {
					throw new Error(`Expected a valid ${root} without lastmod`)
				}
				const entryTag = root === 'sitemapindex' ? 'sitemap' : 'url'
				return [...doc.documentElement.children].map((entry) => {
					const locs = entry.getElementsByTagNameNS(sitemapNamespace, 'loc')
					const loc = locs[0]?.textContent
					if (entry.localName !== entryTag || locs.length !== 1 || !loc) {
						throw new Error(`Malformed ${entryTag} entry`)
					}
					return {
						loc,
						alternates: [...entry.getElementsByTagNameNS(xhtmlNamespace, 'link')].map((link) => [
							link.getAttribute('hreflang'),
							link.getAttribute('href'),
							link.getAttribute('rel'),
						]),
					}
				})
			},
			{ xml: await response.text(), root, sitemapNamespace, xhtmlNamespace },
		)
	}

	const children = await getXml('/sitemap.xml', 'sitemapindex')
	const origin = new URL(children[0].loc).origin
	expect(children.map(({ loc }) => loc).sort()).toEqual(
		locales.map((locale) => `${origin}/sitemap.${locale}.xml`).sort(),
	)
	const prefix = (locale: string) => (locale === 'en-US' ? '' : `/${locale}`)
	const expectedArchiveLinks = [
		['x-default', `${origin}/archive`, 'alternate'],
		...locales.map((locale) => [locale, `${origin}${prefix(locale)}/archive`, 'alternate']),
	]
	const allLocs: string[] = []
	for (const locale of locales) {
		const urls = await getXml(`/sitemap.${locale}.xml`, 'urlset')
		const locs = urls.map(({ loc }) => loc)
		allLocs.push(...locs)
		expect(locs).toEqual(
			expect.arrayContaining([
				origin + prefix(locale),
				`${origin}${prefix(locale)}/games/sudoku`,
				`${origin}${prefix(locale)}/games/word-guess`,
			]),
		)
		const archive = urls.find(({ loc }) => loc === `${origin}${prefix(locale)}/archive`)
		expect(archive?.alternates).toHaveLength(expectedArchiveLinks.length)
		expect(archive?.alternates).toEqual(expect.arrayContaining(expectedArchiveLinks))
		const comparison = urls.find(({ loc }) => loc === `${origin}${prefix(locale)}/vs`)
		if (locale === 'en-US') expect(comparison?.alternates).toEqual([])
		else expect(comparison).toBeUndefined()
		for (const loc of locs) {
			const url = new URL(loc)
			expect(url.origin).toBe(origin)
			expect(url.search + url.hash).toBe('')
			const localeInPath = locales.find((entry) => url.pathname.split('/')[1] === entry)
			expect(localeInPath).toBe(locale === 'en-US' ? undefined : locale)
			expect(url.pathname.slice(prefix(locale).length)).not.toMatch(
				/^\/(?:sign-in|login|signup|register|admin|settings|profile|stats)(?:\/|$)/,
			)
		}
	}
	expect(allLocs.length).toBeGreaterThan(0)
	expect(new Set(allLocs).size).toBe(allLocs.length)
	expect((await request.get('/sitemap.xx.xml', { maxRedirects: 0 })).status()).toBe(404)
})
