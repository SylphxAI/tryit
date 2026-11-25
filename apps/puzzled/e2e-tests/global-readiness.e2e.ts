import { expect, test } from '@playwright/test'
import { defaultLocale, locales } from '../src/lib/i18n/config'

const regionalClock =
	/Hong Kong time|midnight in Hong Kong|hora de Hong Kong|horário de Hong Kong|香港時間|香港时间|UTC\+8|\bHKT\b/i

for (const timezoneId of ['America/Los_Angeles', 'Pacific/Auckland']) {
	test.describe(timezoneId, () => {
		test.use({ timezoneId })
		test('the live countdown targets 16:00 UTC in every locale', async ({ page }) => {
			for (const locale of locales) {
				await page.goto(locale === defaultLocale ? '/' : '/' + locale)
				await expect(page.locator('html')).toHaveAttribute('lang', locale)
				const countdown = page.locator('[data-home-countdown]')
				await expect(countdown).toBeVisible()
				const instant = Date.parse((await countdown.getAttribute('data-reset-at')) ?? '')
				expect(new Date(instant).toISOString()).toMatch(/T16:00:00\.000Z$/)
				// Near rollover, a navigation may legitimately land in the next product day.
				expect(instant).toBeGreaterThan(Date.now() - 5_000)
				expect(instant).toBeLessThanOrEqual(Date.now() + 86_400_000)
				expect(await page.content()).not.toMatch(regionalClock)
			}
		})
	})
}

test('sign-in uses neutral copy and support and discovery state the shared UTC reset', async ({
	page,
	request,
}) => {
	await page.goto('/sign-in')
	await expect(
		page.getByRole('complementary').getByRole('heading', { name: 'Keep your progress with you' }),
	).toBeVisible()
	expect(await page.content()).not.toMatch(regionalClock)
	await page.goto('/support')
	const resetAnswer = page.locator('#faq details').filter({ hasText: '16:00 UTC' })
	await resetAnswer.locator('summary').click()
	await expect(resetAnswer.getByText('16:00 UTC', { exact: false }).last()).toBeVisible()
	for (const locale of locales) {
		const prefix = locale === defaultLocale ? '' : '/' + locale
		for (const path of ['/games', '/support']) {
			const response = await request.get(prefix + path)
			expect(response.ok()).toBe(true)
			const html = await response.text()
			expect(html).toContain('16:00 UTC')
			expect(html).not.toMatch(regionalClock)
		}
	}
	const llms = await request.get('/llms.txt')
	expect(llms.ok()).toBe(true)
	const text = await llms.text()
	expect(text).toContain('16:00 UTC')
	expect(text).not.toMatch(regionalClock)
})

for (const [locale, quad, hunt] of [
	['zh-CN', '所有玩家猜的是同样四个单词', '字母网格和主题对所有玩家都一样'],
	['zh-HK', '所有玩家估嘅都係同樣四個單詞', '每日玩嘅字母方格同主題都一樣'],
	['zh-TW', '所有玩家猜的都是同樣四個單字', '每天看到的字母方格和主題都一樣'],
]) {
	test(locale + ' Quad and Hunt FAQ answers match their JSON-LD', async ({ page }) => {
		for (const [slug, expected] of [
			['quad-words', quad],
			['word-search', hunt],
		]) {
			const response = await page.goto('/' + locale + '/games/' + slug)
			expect(response?.ok()).toBe(true)
			await expect(page.locator('html')).toHaveAttribute('lang', locale)
			const json = await page.locator('script[type="application/ld+json"]').allTextContents()
			const schema = json
				.map((text) => JSON.parse(text))
				.find((node) => node['@type'] === 'FAQPage')
			expect(schema.mainEntity).toHaveLength(3)
			for (const { name, acceptedAnswer } of schema.mainEntity) {
				expect(name).toMatch(/\p{Script=Han}/u)
				expect(acceptedAnswer.text).toMatch(/\p{Script=Han}/u)
				const question = page.locator('summary').filter({ hasText: name })
				await question.click()
				await expect(page.getByText(acceptedAnswer.text, { exact: true })).toBeVisible()
			}
			expect(schema.mainEntity[1].acceptedAnswer.text).toContain(expected)
			expect(schema.mainEntity[1].acceptedAnswer.text).toContain('16:00 UTC')
		}
	})
}
