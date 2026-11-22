import { expect, type Page, test } from '@playwright/test'

const currencies = [
	'usd',
	'gbp',
	'eur',
	'aud',
	'cad',
	'hkd',
	'idr',
	'jpy',
	'krw',
	'myr',
	'nzd',
	'php',
	'sgd',
	'thb',
	'twd',
	'vnd',
]

async function comparisonSchema(page: Page) {
	return JSON.parse(
		(await page.locator('main script[type="application/ld+json"]').textContent()) ?? '',
	)['@graph']
}

test('the initial comparison HTML uses the edge currency and leaves competitor US prices alone', async ({
	browser,
	baseURL,
}) => {
	const context = await browser.newContext({
		baseURL,
		javaScriptEnabled: false,
		extraHTTPHeaders: { 'cf-ipcountry': 'HK' },
	})
	try {
		const page = await context.newPage()
		const response = await page.goto('/vs/elevate')
		expect(response?.status()).toBe(200)
		expect(response?.headers()['cache-control']).toBe('private, no-store')
		const select = page.getByLabel('Currency', { exact: true })
		await expect(select).toHaveValue('hkd')
		expect(
			await select
				.locator('option')
				.evaluateAll((options) => options.map((o) => o.getAttribute('value'))),
		).toEqual(currencies)
		await expect(page.locator('#side-by-side')).toContainText(
			'Tryit Plus: HK$49 per month or HK$319 per year.',
		)
		await expect(page.locator('#side-by-side')).toContainText(
			'Premium $39.99/year with a 7-day free trial, or $9.99/month, on the US App Store',
		)
		const [software, faq] = await comparisonSchema(page)
		expect(software.offers).toHaveLength(6)
		expect(software.offers.map((offer: { priceCurrency: string }) => offer.priceCurrency)).toEqual(
			Array(6).fill('HKD'),
		)
		expect(software.offers).toContainEqual({
			'@type': 'Offer',
			name: '3-Day Pass',
			price: '29',
			priceCurrency: 'HKD',
		})
		const question = page.locator('#faq details').filter({ hasText: 'How much does Tryit cost' })
		await question.locator('summary').click()
		await expect(question.locator('p')).toContainText('3-Day Pass: HK$29 once, no renewal.')
		expect(faq.mainEntity).toContainEqual(
			expect.objectContaining({
				acceptedAnswer: { '@type': 'Answer', text: await question.locator('p').textContent() },
			}),
		)
	} finally {
		await context.close()
	}
})

test('switching currency persists across rivals, locale prefixes and pricing', async ({
	page,
	context,
}) => {
	await context.setExtraHTTPHeaders({ 'cf-ipcountry': 'GB' })
	await page.goto('/vs/nyt-games')
	const select = page.getByLabel('Currency', { exact: true })
	await expect(select).toHaveValue('gbp')
	await expect(page.locator('#side-by-side')).toContainText('3-Day Pass: £2.99 once')
	await Promise.all([
		page.waitForNavigation({ waitUntil: 'domcontentloaded' }),
		select.selectOption('jpy'),
	])
	await expect(select).toHaveValue('jpy')
	await expect(page.locator('#side-by-side')).toContainText('¥479 once')
	await expect(page.locator('#side-by-side')).toContainText('¥799 per month or ¥6,399 per year')
	const [software] = await comparisonSchema(page)
	// JPY amounts are already in whole yen at the billing boundary.
	expect(software.offers).toContainEqual({
		'@type': 'Offer',
		name: '3-Day Pass',
		price: '479',
		priceCurrency: 'JPY',
	})
	for (const path of ['/vs/puzzmo', '/en-GB/vs/wordle']) {
		await page.goto(path)
		await expect(select).toHaveValue('jpy')
		await expect(page.locator('#side-by-side')).toContainText('479 once')
	}
	await page.goto('/pricing')
	await expect(select).toHaveValue('jpy')
	for (const price of ['¥479', '¥799', '¥6,399', '¥1,279', '¥10,389']) {
		await expect(page.getByText(price, { exact: true }).first()).toBeVisible()
	}
})
