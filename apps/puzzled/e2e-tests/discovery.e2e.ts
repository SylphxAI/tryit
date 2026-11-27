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
						url: new URL(path === '/' ? '/pricing' : `${path}/pricing`, app.url).href,
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

const erasureLabels = [
	['en-US', 'Request deletion by email: '],
	['en-GB', 'Request deletion by email: '],
	['zh-HK', '以電郵申請刪除：'],
	['zh-TW', '以電郵申請刪除：'],
	['zh-CN', '通过邮件申请删除：'],
	['ja', 'メールで削除を申請：'],
	['es', 'Solicita la eliminación por correo: '],
	['pt-BR', 'Solicite a exclusão por e-mail: '],
] as const

test.describe('Signed-out erasure contact', () => {
	test.use({ javaScriptEnabled: false })

	for (const [locale, label] of erasureLabels) {
		test(`${locale} routes the deletion email to the privacy mailbox`, async ({ page }) => {
			const prefix = locale === 'en-US' ? '' : `/${locale}`
			const response = await page.goto(`${prefix}/delete-account`)
			expect(response?.status()).toBe(200)
			await expect(page.locator('html')).toHaveAttribute('lang', locale)
			const main = page.getByRole('main')
			await expect(main.locator(`a[href="${prefix}/sign-in?recovery=1"]`)).toBeVisible()
			await expect(
				main.locator(`a[href="${prefix}/sign-in?callbackUrl=%2Fsettings%2Faccount"]`),
			).toBeVisible()
			await expect(main.locator(`a[href="${prefix}/privacy"]`)).toBeVisible()
			const email = main.locator('a[href^="mailto:"]')
			await expect(email).toBeVisible()
			expect({ href: await email.getAttribute('href'), text: await email.textContent() }).toEqual({
				href: 'mailto:legal@sylphx.com?subject=Tryit%20account%20deletion%20request',
				text: `${label}legal@sylphx.com`,
			})
		})
	}
})

const googlebot = { 'User-Agent': 'Googlebot/2.1' }

test('all locale homepages serve an indexable Tryit Plus image in initial HTML', async ({
	request,
	page,
}) => {
	const prefixes = ['', '/en-GB', '/zh-HK', '/zh-TW', '/zh-CN', '/ja', '/es', '/pt-BR']
	let imageUrl: URL | undefined
	for (const prefix of prefixes) {
		const home = await request.get(prefix || '/', { maxRedirects: 0, headers: googlebot })
		expect(home.status(), prefix).toBe(200)
		const products = await page.evaluate(
			(html) => {
				const doc = new DOMParser().parseFromString(html, 'text/html')
				return [...doc.querySelectorAll('script[type="application/ld+json"]')]
					.map((script) => JSON.parse(script.textContent ?? ''))
					.filter((schema) => schema['@type'] === 'Product' && schema.name === 'Tryit Plus')
			},
			await home.text(),
		)
		expect(products, prefix).toHaveLength(1)
		const [product] = products
		const image = new URL(product.image)
		const pricing = new URL(product.url)
		expect(pricing.href).toBe(new URL(`${prefix}/pricing`, image.origin).href)
		expect(product.offers.length).toBeGreaterThan(0)
		for (const offer of product.offers) {
			expect(offer['@type']).toBe('Offer')
			expect(offer.url).toBe(pricing.href)
			expect(offer.priceCurrency).toMatch(/^[A-Z]{3}$/)
			expect(Number(offer.price)).toBeGreaterThan(0)
		}
		if (imageUrl) expect(image.href).toBe(imageUrl.href)
		else imageUrl = image
	}
	if (!imageUrl) throw new Error('No structured product image served')
	// CI sets the canonical production origin while serving the built app locally.
	const image = await request.get(imageUrl.pathname + imageUrl.search, {
		maxRedirects: 0,
		headers: googlebot,
	})
	expect(image.status()).toBe(200)
	expect(image.headers()['content-type']).toBe('image/png')
	expect(image.headers()['x-robots-tag']).toBeUndefined()
	const data = await image.body()
	expect(data.subarray(0, 8).toString('hex')).toBe('89504e470d0a1a0a')
	expect(data.readUInt32BE(16) * data.readUInt32BE(20)).toBeGreaterThanOrEqual(50_000)
})

test('the sitemap index serves one canonical XML URL set per locale', async ({ page, request }) => {
	const sitemapNamespace = 'http://www.sitemaps.org/schemas/sitemap/0.9'
	const xhtmlNamespace = 'http://www.w3.org/1999/xhtml'
	const locales = ['en-US', 'en-GB', 'zh-HK', 'zh-TW', 'zh-CN', 'ja', 'es', 'pt-BR']
	const getXml = async (path: string, root: 'sitemapindex' | 'urlset') => {
		const headers = {
			...googlebot,
			cookie: 'NEXT_LOCALE=es; sylphx_identity_session=ignored-fixture',
		}
		const response = await request.get(path, { maxRedirects: 0, headers })
		expect(response.status(), path).toBe(200)
		expect(response.headers()['content-type']).toBe('application/xml; charset=utf-8')
		expect(response.headers()['cache-control']).toBe('public, max-age=3600')
		expect(response.headers()['set-cookie']).toBeUndefined()
		expect(response.headers()['x-robots-tag']).toBeUndefined()
		const bytes = await response.body()
		expect(bytes.subarray(0, 38).toString('ascii')).toBe('<?xml version="1.0" encoding="UTF-8"?>')
		expect(bytes.length).toBeLessThan(52_428_800)
		const head = await request.head(path, { maxRedirects: 0, headers })
		expect(head.status(), path).toBe(200)
		for (const name of ['content-type', 'cache-control', 'x-robots-tag', 'set-cookie']) {
			expect(head.headers()[name], name).toBe(response.headers()[name])
		}
		expect(await head.body()).toHaveLength(0)
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
					if (root === 'urlset') {
						const tags = [...entry.children].map((child) => child.tagName)
						if (
							tags.slice(0, 3).join(',') !== 'loc,changefreq,priority' ||
							tags.slice(3).some((tag) => tag !== 'xhtml:link')
						) {
							throw new Error(`Sitemap extensions must follow core fields: ${loc}`)
						}
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
			{
				xml: new TextDecoder('utf-8', { fatal: true }).decode(bytes),
				root,
				sitemapNamespace,
				xhtmlNamespace,
			},
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
