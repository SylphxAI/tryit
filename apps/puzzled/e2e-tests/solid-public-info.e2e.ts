import { expect, test } from '@playwright/test'

test.describe('Solid public information routes', () => {
	test.skip(process.env.SOLID_FIXTURE !== '1', 'run against the Solid production build')
	test('support FAQ works without JavaScript, with structured data from the same copy', async ({
		browser,
	}) => {
		const page = await browser.newPage({ javaScriptEnabled: false })
		try {
			const response = await page.goto('/zh-HK/support')
			expect(response?.status()).toBe(200)
			await expect(page.getByRole('heading', { name: '支援與協助', level: 1 })).toBeVisible()
			await expect(page.locator('link[rel=canonical]')).toHaveAttribute('href', /\/zh-HK\/support$/)
			await expect(page.locator('#resources a[href="/zh-HK/sign-in?recovery=1"]')).toBeVisible()
			await expect(page.locator('main a[href^="mailto:hi@tryit.fun"]').first()).toBeVisible()
			const items = page.locator('#faq details')
			await expect(items).toHaveCount(9)
			const first = items.first()
			const summary = first.locator('summary')
			await summary.focus()
			await summary.press('Enter')
			await expect(first.locator('p')).toBeVisible()
			const data = JSON.parse(
				(await page.locator('#faq script[type="application/ld+json"]').textContent()) ?? '',
			)
			expect(data['@type']).toBe('FAQPage')
			expect(data.mainEntity[0].name).toBe((await summary.textContent())?.trim())
			expect(data.mainEntity[0].acceptedAnswer.text).toBe(
				(await first.locator('p').textContent())?.trim(),
			)
		} finally {
			await page.close()
		}
	})

	test('account deletion instructions are public and the sign-in CTA keeps the exact destination', async ({
		page,
	}) => {
		const response = await page.goto('/delete-account')
		expect(response?.status()).toBe(200)
		expect(response?.headers()['cache-control']).toBe('private, no-store')
		await expect(page.getByRole('heading', { name: 'Delete your Tryit account' })).toBeVisible()
		await expect(
			page.getByRole('link', { name: 'Read the privacy and retention policy' }),
		).toHaveAttribute('href', '/privacy')
		const signIn = page.getByRole('link', { name: 'Sign in to delete your account' })
		await signIn.click()
		await expect(page).toHaveURL(/\/sign-in\?callbackUrl=%2Fsettings%2Faccount$/)
	})

	test('seller disclosure serves the full Japanese page and refuses non-Japanese URLs', async ({
		page,
		request,
	}) => {
		const response = await page.goto('/ja/tokushoho')
		expect(response?.status()).toBe(200)
		await expect(
			page.getByRole('heading', { name: '特定商取引法に基づく表記', level: 1 }),
		).toBeVisible()
		await expect(page.locator('link[rel=canonical]')).toHaveAttribute('href', /\/ja\/tokushoho$/)
		await expect(page.locator('link[rel=alternate][hreflang]')).toHaveCount(0)
		await expect(page.locator('#contact a[href="mailto:legal@sylphx.com"]')).toBeVisible()
		await expect(page.locator('#cancel h2')).toHaveText('返品・キャンセル')
		for (const path of ['/tokushoho', '/es/tokushoho']) {
			expect((await request.get(path)).status()).toBe(404)
		}
	})
})
