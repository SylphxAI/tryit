import { expect, test } from '@playwright/test'

const comparisons = [
	'nyt-games',
	'lumosity',
	'linkedin-games',
	'elevate',
	'puzzmo',
	'brilliant',
	'wordle',
]
const useCases = ['daily-word-and-logic-puzzles-online', 'family-brain-games-no-ads']

test('comparison hub exposes all seven cards and their loaded motifs', async ({ page }) => {
	const response = await page.goto('/vs')
	expect(response?.status()).toBe(200)
	await expect(page.getByRole('heading', { level: 1 })).toHaveText('Tryit, honestly compared')
	await expect(page.locator('[data-comparison-card]')).toHaveCount(comparisons.length)
	for (const slug of comparisons) {
		const card = page.locator(`[data-comparison-card="${slug}"]`)
		await expect(card).toHaveAttribute('href', `/vs/${slug}`)
		const image = card.locator('img')
		await image.scrollIntoViewIfNeeded()
		await expect
			.poll(() =>
				image.evaluate((element) =>
					element instanceof HTMLImageElement ? element.naturalWidth : 0,
				),
			)
			.toBeGreaterThan(0)
	}
	await page.locator('[data-comparison-card="wordle"]').click()
	await expect(page).toHaveURL(/\/vs\/wordle$/)
	await expect(page.getByRole('table')).toBeVisible()
})

test('details serve canonical SEO and structured data without client JavaScript', async ({
	browser,
	baseURL,
}) => {
	const context = await browser.newContext({
		baseURL,
		javaScriptEnabled: false,
		viewport: { width: 390, height: 844 },
	})
	try {
		const page = await context.newPage()
		const paths = [
			'/vs',
			...comparisons.map((slug) => `/vs/${slug}`),
			...useCases.map((slug) => `/use-cases/${slug}`),
		]
		for (const path of paths) {
			const response = await page.goto(`/es${path}`)
			expect(response?.status(), path).toBe(200)
			await expect(page.getByRole('heading', { level: 1 })).toHaveCount(1)
			await expect(page.locator('html')).toHaveAttribute('lang', 'es')
			await expect(page.locator('main')).toHaveAttribute('lang', 'en-US')
			const canonical = page.locator('link[rel="canonical"]')
			await expect(canonical).toHaveAttribute('href', new RegExp(`^https?://[^/]+${path}$`))
			await expect(page.locator('meta[property="og:url"]')).toHaveAttribute(
				'content',
				(await canonical.getAttribute('href')) ?? '',
			)
			await expect(page.locator('link[hreflang]')).toHaveCount(0)
			const schema = JSON.parse(
				(await page.locator('main script[type="application/ld+json"]').textContent()) ?? '',
			)
			if (path === '/vs') {
				expect(schema['@type']).toBe('CollectionPage')
				expect(schema.mainEntity.itemListElement).toHaveLength(comparisons.length)
				continue
			}
			expect(schema['@graph'].map((node: { '@type': string }) => node['@type'])).toEqual(
				path.startsWith('/vs/')
					? ['SoftwareApplication', 'FAQPage', 'BreadcrumbList']
					: ['SoftwareApplication', 'FAQPage'],
			)
			if (path.startsWith('/vs/')) {
				const slug = path.split('/').at(-1)
				await expect(page.locator(`main a[href="/es?entry_surface=seo_vs-${slug}"]`)).toHaveCount(2)
			}
			const summary = page.locator('main details summary').first()
			await summary.focus()
			await page.keyboard.press('Enter')
			await expect(page.locator('main details').first()).toHaveAttribute('open', '')
			await expect(page.locator('main details p').first()).toBeVisible()
		}
	} finally {
		await context.close()
	}
})

test('unknown rival and use-case slugs are non-indexable 404s', async ({ page }) => {
	for (const path of ['/vs/not-a-comparison', '/use-cases/constructor', '/not-a-locale/vs']) {
		expect((await page.goto(path))?.status(), path).toBe(404)
		await expect(page.locator('meta[name="robots"]')).toHaveAttribute(
			'content',
			'noindex, nofollow',
		)
		await expect(page.getByRole('heading', { level: 1 })).toHaveText('Page not found')
	}
})
