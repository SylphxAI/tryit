import AxeBuilder from '@axe-core/playwright'
import { expect, type Locator, type Page, test } from '@playwright/test'
import { PRACTICE_GAMES } from '../src/features/practice/lib/practice'
import { getGameSlugs } from '../src/games/registry'
import { CURRENCY_COOKIE } from '../src/lib/billing/currency'
import { defaultLocale } from '../src/lib/i18n/config'
import { createTranslator } from '../src/lib/i18n/translate'
import { CONSENT_KEY } from '../src/lib/storage-keys'
import { DESKTOP, MOBILE, settle, WCAG_TAGS } from './a11y-support'

/** Pricing choices, benefits and guest return paths stay available at every size. */
const dailyCount = getGameSlugs().length
const practiceCount = PRACTICE_GAMES.length
const VIEWPORTS = [
	{ name: 'laptop-1440x757', width: 1440, height: 757 },
	{ name: 'desktop-1440x900', width: 1440, height: 900 },
	{ name: 'tablet-768x1024', width: 768, height: 1024 },
	{ name: 'mobile-390x844', width: 390, height: 844 },
	{ name: 'small-375x667', width: 375, height: 667 },
]

for (const [width, height] of [
	[1280, 803],
	[1440, 900],
	[1920, 937],
	[390, 844],
]) {
	test(`pricing exits clear the undismissed consent and navigation docks at ${width}×${height}`, async ({
		page,
	}) => {
		await page.setViewportSize({ width, height })
		await page.setExtraHTTPHeaders({ 'CF-IPCountry': 'DE' })
		await openPricing(page)
		await expect(
			page.locator('[data-consent-banner] [data-consent-choices]').getByRole('button'),
		).toHaveText(['Decline', 'Accept', 'Analytics only'])
		await page.evaluate(() => document.fonts.ready)
		if (width === 390) await expect(page.locator('.site-tab-bar')).toBeVisible()
		const family = page.getByRole('link', { name: /^Family plan for up to \d+ players$/ })
		if (width === 390) await expect(family).toBeVisible()
		else await expect(family).toHaveCount(0)
		for (const name of [
			...(width === 390 ? [/^Family plan for up to \d+ players$/] : []),
			`Play 3 of ${dailyCount} daily puzzles free`,
		]) {
			const link = page.getByRole('link', { name })
			await expect(link).toHaveCSS('text-decoration-line', 'none')
			const geometry = await link.evaluate((el) => {
				const rect = el.getBoundingClientRect()
				const dockTop = Math.min(
					innerHeight,
					...Array.from(document.querySelectorAll('[data-consent-banner], .site-tab-bar'))
						.filter((dock) => dock.getClientRects().length)
						.map((dock) => dock.getBoundingClientRect().top),
				)
				const hit = [0.2, 0.5, 0.8].every((x) =>
					[0.15, 0.5, 0.85].every((y) =>
						el.contains(
							document.elementFromPoint(rect.left + rect.width * x, rect.top + rect.height * y),
						),
					),
				)
				return {
					clear: rect.top >= 0 && rect.bottom <= dockTop && hit,
					height: rect.height,
					xOverflow: document.documentElement.scrollWidth - innerWidth,
					scrollY,
				}
			})
			expect(geometry).toMatchObject({ clear: true, xOverflow: 0, scrollY: 0 })
			expect(geometry.height).toBeGreaterThanOrEqual(44)
		}
	})
}

test('pricing exits paint keyboard focus but no mouse focus ring', async ({ page }) => {
	await page.setViewportSize({ width: 390, height: 844 })
	await openPricing(page)
	const family = page.getByRole('link', { name: 'Family plan for up to 4 players', exact: true })
	const freePlay = page.getByRole('link', {
		name: `Play 3 of ${dailyCount} daily puzzles free`,
		exact: true,
	})

	// Let Chromium focus the clicked anchor but keep this frame in place for inspection.
	await family.evaluate((el) =>
		el.addEventListener('click', (event) => event.preventDefault(), { once: true }),
	)
	await family.click()
	await expect(family).toBeFocused()
	await expect(family).toHaveCSS('outline-style', 'none')
	await expect(family).toHaveCSS('box-shadow', 'none')
	await page.keyboard.press('Tab')
	await expect(freePlay).toBeFocused()
	await expect(freePlay).toHaveCSS('outline-style', 'solid')
	await expect(freePlay).toHaveCSS('outline-width', '2px')
	await page.keyboard.press('Shift+Tab')
	await expect(family).toBeFocused()
	await expect(family).toHaveCSS('outline-style', 'solid')
	await page.keyboard.press('Enter')
	await expect(page).toHaveURL(/#family$/)
})

const pricingLegalCases = [
	{
		locale: 'en-US',
		currency: 'USD',
		amounts: [2.99, 4.99, 39.99],
		seller:
			'Prices include VAT where it applies. Sold by Sylphx Limited, registered in England and Wales.',
	},
	{
		locale: 'en-GB',
		currency: 'GBP',
		amounts: [2.99, 3.99, 29.99],
		seller:
			'Prices include VAT where it applies. Sold by Sylphx Limited, registered in England and Wales.',
	},
	{
		locale: 'es',
		currency: 'USD',
		amounts: [2.99, 4.99, 39.99],
		seller:
			'Los precios incluyen el IVA cuando corresponda. Vendido por Sylphx Limited, registrada en Inglaterra y Gales.',
	},
	{
		locale: 'ja',
		currency: 'USD',
		amounts: [2.99, 4.99, 39.99],
		seller:
			'表示価格には、適用される場合はVATが含まれます。販売元：Sylphx Limited（イングランド・ウェールズ登録）。',
	},
	{
		locale: 'pt-BR',
		currency: 'USD',
		amounts: [2.99, 4.99, 39.99],
		seller:
			'Os preços incluem impostos (VAT) quando aplicável. Vendido pela Sylphx Limited, registrada na Inglaterra e no País de Gales.',
	},
	{
		locale: 'zh-CN',
		currency: 'USD',
		amounts: [2.99, 4.99, 39.99],
		seller: '价格已包含适用的增值税。由 Sylphx Limited（在英格兰及威尔士注册）销售。',
	},
	{
		locale: 'zh-HK',
		currency: 'HKD',
		amounts: [29, 49, 319],
		seller: '價格已包含適用的增值稅。由 Sylphx Limited（於英格蘭及威爾士註冊）出售。',
	},
	{
		locale: 'zh-TW',
		currency: 'USD',
		amounts: [2.99, 4.99, 39.99],
		seller: '價格已包含適用的增值稅。由 Sylphx Limited（於英格蘭及威爾斯註冊）銷售。',
	},
] as const

for (const { locale, currency, amounts, seller } of pricingLegalCases) {
	for (const viewport of [MOBILE, DESKTOP]) {
		test(`pricing renewal disclosure: ${locale} ${viewport.width}×${viewport.height}`, async ({
			page,
			context,
			baseURL,
		}) => {
			if (!baseURL || !['localhost', '127.0.0.1'].includes(new URL(baseURL).hostname)) {
				throw new Error('The loopback open-plan fixture URL is required')
			}
			const origin = new URL(baseURL).origin
			await page.setViewportSize(viewport)
			await context.addCookies([
				{ name: CURRENCY_COOKIE, value: currency.toLowerCase(), url: baseURL },
			])
			await page.addInitScript((key) => localStorage.setItem(key, 'denied'), CONSENT_KEY)
			await context.route('**/*', (route) =>
				route.request().method() === 'GET' && new URL(route.request().url()).origin === origin
					? route.continue()
					: route.abort(),
			)
			const prefix = locale === defaultLocale ? '' : `/${locale}`
			await page.goto(`${prefix}/pricing?plan=individual_once#plus`)
			await expect(page.locator('html')).toHaveAttribute('lang', locale)
			const offer = page.locator('#plus')
			const cta = offer.locator('button[data-checkout-trigger="pricing_card"]')
			const footer = page.locator('#plans').getByText(seller, { exact: true })
			const terms = page.locator(`#plans a[href="${prefix}/terms#subscriptions"]`)
			const t = createTranslator(locale)
			const copy = (key: string, values?: Record<string, string | number>) =>
				t(`plus.pricing.${key}`, values)
			const price = (amount: number) =>
				new Intl.NumberFormat(locale, {
					style: 'currency',
					currency,
					maximumFractionDigits: Number.isInteger(amount) ? 0 : 2,
				}).format(amount)

			await expect(offer.getByRole('radio')).toHaveCount(3)
			await expect(offer.locator('input[value="once"]')).toBeChecked()
			for (const [interval, amount] of [
				['once', amounts[0]],
				['month', amounts[1]],
				['year', amounts[2]],
				['once', amounts[0]],
			] as const) {
				const radio = offer.locator(`input[value="${interval}"]`)
				await radio.check()
				await expect(radio).toBeChecked()
				const row = radio.locator('..')
				await expect(row.getByText(price(amount), { exact: true })).toBeVisible()
				if (locale === 'en-US' || locale === 'en-GB') {
					const cadence = { once: 'one time', month: 'billed monthly', year: 'billed yearly' }
					await expect(row.getByText(cadence[interval], { exact: true })).toBeVisible()
					if (interval === 'year') {
						const equivalent = locale === 'en-GB' ? '£2.50' : '$3.33'
						await expect(
							row.getByText(`${equivalent}/mo equivalent`, { exact: true }),
						).toBeVisible()
					}
				}
				const once = interval === 'once'
				const adjacent = cta.locator('xpath=preceding-sibling::p[1]')
				await expect(adjacent).toHaveText(
					once
						? copy('passTerms', { days: 3 })
						: copy(interval === 'month' ? 'renewsMonthly' : 'renewsYearly', {
								price: price(amount),
							}),
				)
				if (once) {
					const waiver = offer.getByRole('checkbox', {
						name: copy('immediateSupplyConsent'),
						exact: true,
					})
					await expect(waiver).toBeVisible()
					await expect(waiver).not.toBeChecked()
					await expect(cta).toBeDisabled()
				} else {
					await expect(offer.getByRole('checkbox')).toHaveCount(0)
					await expect(cta).toBeEnabled()
					await expect(cta).toHaveAccessibleDescription(copy('recurringSupplyTerms'))
				}
				await expect(footer).toBeVisible()
				await expect(terms).toBeVisible()
			}
		})
	}
}

async function openPricing(page: Page) {
	await page.goto('/pricing', { waitUntil: 'domcontentloaded' })
	await settle(page)
}

/** Check the painted hit target, including rounded CTA corners, without navigating. */
async function expectReachable(target: Locator) {
	await target.evaluate((el) => el.scrollIntoView({ block: 'center' }))
	await expect(target).toBeInViewport({ ratio: 1 })
	expect(
		await target.evaluate((el) => {
			const r = el.getBoundingClientRect()
			return [
				[r.x + 8, r.y + 8],
				[r.right - 8, r.y + 8],
				[r.x + 8, r.bottom - 8],
				[r.right - 8, r.bottom - 8],
			].every(([x, y]) => el.contains(document.elementFromPoint(x, y)))
		}),
	).toBe(true)
	await target.click({ trial: true })
}

for (const viewport of VIEWPORTS) {
	test.describe(`Pricing first screen (${viewport.name})`, () => {
		test.use({ viewport: { width: viewport.width, height: viewport.height } })

		for (const consentState of ['open', 'dismissed'] as const) {
			test(`viewport evidence with consent ${consentState}`, async ({ page }, testInfo) => {
				await openPricing(page)
				const decline = page.getByRole('button', { name: 'Decline', exact: true })
				await expect(decline).toBeVisible()
				if (consentState === 'dismissed') await decline.click()
				await page.evaluate(() => window.scrollTo(0, 0))
				await testInfo.attach(`pricing-${viewport.name}-${consentState}-initial`, {
					body: await page.screenshot({
						fullPage: false,
						path: testInfo.outputPath(`pricing-${viewport.name}-${consentState}-initial.png`),
					}),
					contentType: 'image/png',
				})
				expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(
					viewport.width,
				)
				if (viewport.width === 1440 || viewport.width === 390) {
					// Before dismissing the cookie banner or scrolling, the flagship CTA
					// must be 100% unobstructed and never overlap the cookie banner.
					const plusCta = page.locator('#plus').getByRole('button', { name: 'Start Tryit Plus' })
					await expect(plusCta).toBeEnabled()
					const unobstructed = await plusCta.evaluate((el) => {
						const r = el.getBoundingClientRect()
						const banner = document.querySelector('[data-consent-banner]')
						const b = banner?.getBoundingClientRect()
						const overlapsBanner =
							!!b &&
							b.width > 0 &&
							b.height > 0 &&
							r.left < b.right &&
							r.right > b.left &&
							r.top < b.bottom &&
							r.bottom > b.top
						const hitAllCorners = [
							[r.x + 8, r.y + 8],
							[r.right - 8, r.y + 8],
							[r.x + 8, r.bottom - 8],
							[r.right - 8, r.bottom - 8],
							[r.x + r.width / 2, r.y + r.height / 2],
						].every(([x, y]) => el.contains(document.elementFromPoint(x, y)))
						return { overlapsBanner, hitAllCorners }
					})
					expect(unobstructed.overlapsBanner).toBe(false)
					expect(unobstructed.hitAllCorners).toBe(true)
					if (viewport.width === 1440) {
						// Flagship checkout sits cleanly inside the initial laptop & desktop fold.
						const bottom = await plusCta.evaluate((el) => el.getBoundingClientRect().bottom)
						expect(bottom).toBeLessThanOrEqual(viewport.height)
					}
				}
				for (const id of ['plus', 'family']) {
					const offer = page.locator(`#${id}`)
					await expect(
						offer.getByText(`All ${dailyCount} daily games`, { exact: true }),
					).toBeVisible()
					await expect(
						offer.getByText(`Unlimited practice in ${practiceCount} games`, { exact: true }),
					).toBeVisible()
					await expect(
						offer.getByText('Puzzles from the past 30 days', { exact: true }),
					).toBeVisible()
					await expect(
						offer.getByText('Stats and streaks for every game', { exact: true }),
					).toBeVisible()
					// Recurring subscriptions (Yearly default) never render the Reg 37 14-day waiver checkbox.
					await expect(offer.getByRole('checkbox')).toHaveCount(0)
					const cta = offer.getByRole('button', {
						name: id === 'plus' ? 'Start Tryit Plus' : 'Continue to payment',
					})
					await expect(cta).toBeEnabled()
					await cta.evaluate((el) => el.scrollIntoView({ block: 'center' }))
					await expect(cta).toBeInViewport({ ratio: 1 })
					await testInfo.attach(`pricing-${viewport.name}-${consentState}-${id}-scrolled`, {
						body: await page.screenshot({
							fullPage: false,
							path: testInfo.outputPath(
								`pricing-${viewport.name}-${consentState}-${id}-scrolled.png`,
							),
						}),
						contentType: 'image/png',
					})
					await expectReachable(cta)
				}
				// Selecting the one-off 3-Day Pass renders and requires the Reg 37 14-day waiver checkbox.
				const plus = page.locator('#plus')
				const passRadio = plus.locator('input[value="once"]')
				if ((await passRadio.count()) > 0) {
					await passRadio.check()
					const waiver = plus.getByRole('checkbox')
					await expect(waiver).toHaveCount(1)
					await expect(waiver).not.toBeChecked()
					const passCta = plus.getByRole('button', { name: 'Continue to payment' })
					await expect(passCta).toBeDisabled()
					await waiver.check()
					await expect(passCta).toBeEnabled()
					await expectReachable(passCta)
					await plus.locator('input[value="year"]').check()
					await expect(plus.getByRole('checkbox')).toHaveCount(0)
				}
				// Pricing is a page, with a free-play escape link rather than a modal close button.
				const freePlay = page.getByRole('link', {
					name: `Play 3 of ${dailyCount} daily puzzles free`,
					exact: true,
				})
				await expect(freePlay).toHaveAttribute('href', /^\/games\/[^/?#]+$/)
				await expectReachable(freePlay)
				for (const path of ['/privacy', '/terms']) {
					const legal = page.locator(`footer li > a[href="${path}"]`)
					await expect(legal).toHaveCount(1)
					await expectReachable(legal)
				}
				if (consentState === 'open') await expect(decline).toBeVisible()
				else await expect(decline).toHaveCount(0)
			})
		}

		test('leads with Plus: Yearly preselected and checkout reachable', async ({
			page,
		}, testInfo) => {
			await openPricing(page)
			// Single clean render: one #plus card, one #family card, zero Loading...
			await expect(page.locator('#plus')).toHaveCount(1)
			await expect(page.locator('#family')).toHaveCount(1)
			await expect(page.getByText('Loading...')).toHaveCount(0)
			const offer = page.locator('#plus')
			const yearly = offer.getByRole('radio', { name: /^Yearly/ })
			test.skip((await yearly.count()) === 0, 'sales are closed: no plans to lead with')

			await expect(yearly).toBeChecked()
			await expect(offer.getByRole('radio', { name: /^Monthly/ })).not.toBeChecked()

			// Cold guests and signed-in non-members get compliant Reg 36 terms + enabled payment CTA on recurring plans.
			await expect(offer.getByRole('checkbox')).toHaveCount(0)
			const payment = offer.getByRole('button', { name: 'Start Tryit Plus' })
			await payment.scrollIntoViewIfNeeded()
			await expect(payment).toBeInViewport({ ratio: 1 })
			await expect(payment).toBeEnabled()

			await testInfo.attach(`pricing-${viewport.name}`, {
				body: await page.screenshot(),
				contentType: 'image/png',
			})
		})

		test('keeps free play as one link and puts the Free card after it', async ({ page }) => {
			await openPricing(page)
			const offer = page.locator('#plus')
			test.skip((await offer.getByRole('radio').count()) === 0, 'sales are closed')

			const freePlay = page.getByRole('link', {
				name: `Play 3 of ${dailyCount} daily puzzles free`,
			})
			await expect(freePlay).toHaveCount(1)
			await freePlay.evaluate((el) => el.scrollIntoView({ block: 'center' }))
			await expect(freePlay).toBeInViewport({ ratio: 1 })
			const family = page.getByRole('link', { name: /^Family plan for up to \d+ players$/ })
			if (viewport.width < 1024) await expect(family).toBeVisible()
			else await expect(family).toHaveCount(0)
			// The only other free-play control would be a duplicate button.
			await expect(page.getByRole('link', { name: /^Play today's free puzzle/ })).toHaveCount(0)

			const freeCard = page.getByRole('heading', { name: 'Free', exact: true })
			await expect(freeCard).toBeVisible()
			const freeTop = (await freeCard.boundingBox())?.y ?? 0
			const linkBottom = await freePlay.evaluate((el) => el.getBoundingClientRect().bottom)
			expect(freeTop, 'the Free card sits below the free-play link').toBeGreaterThan(linkBottom)
		})

		test('preselects requested plan query for both Plus and Family offers', async ({ page }) => {
			await openPricing(page)
			const offer = page.locator('#plus')
			test.skip((await offer.getByRole('radio').count()) === 0, 'sales are closed')
			for (const [interval, plan] of [
				['month', 'individual_monthly'],
				['once', 'individual_once'],
				['year', 'individual_yearly'],
			]) {
				await page.goto(`/pricing?plan=${plan}#plus`)
				await settle(page)
				const radio = offer.locator(`input[value="${interval}"]`)
				if ((await radio.count()) === 0) continue
				await expect(radio).toBeChecked()
			}
			const family = page.locator('#family')
			await page.goto('/pricing?plan=family_monthly#family')
			await settle(page)
			await expect(family).toContainText('$7.99')
			await expect(family.locator('input[value="month"]')).toBeChecked()
			await expect(family.getByRole('checkbox')).toHaveCount(0)
			await expect(family.getByRole('button', { name: 'Continue to payment' })).toBeEnabled()
		})

		test('starts cold-guest checkout directly with consent, attribution and callbackUrl, and prompts cleanly on return', async ({
			page,
		}) => {
			let capturedBody: Record<string, unknown> | null = null
			let capturedHeaders: Record<string, string> = {}
			await page.route('**/v1/guest/session', async (route) => {
				await route.fulfill({
					status: 200,
					contentType: 'application/json',
					body: JSON.stringify({ issued: true }),
				})
			})
			await page.route('**/puzzled.v1.BillingService/CreateCheckout', async (route) => {
				capturedHeaders = route.request().headers()
				capturedBody = JSON.parse(route.request().postData() ?? '{}') as Record<string, unknown>
				await route.fulfill({
					status: 200,
					contentType: 'application/json',
					body: JSON.stringify({
						url: `${new URL(page.url()).origin}/settings/subscription?checkout=success&s=cs_e2e_guest_1&callbackUrl=%2Fgames%2Fsudoku`,
					}),
				})
			})

			const query = [
				'callbackUrl=%2Fgames%2Fsudoku',
				'utm_source=google',
				'utm_medium=cpc',
				'gclid=Cj0_e2e_test',
				'gbraid=gb_e2e',
				'wbraid=wb_e2e',
				'fbclid=fb_e2e',
			].join('&')
			await page.goto(`/pricing?${query}`, { waitUntil: 'domcontentloaded' })
			await settle(page)
			await expect(page.locator('[data-consent-banner]')).toBeVisible()

			const offer = page.locator('#plus')
			test.skip((await offer.getByRole('radio').count()) === 0, 'sales are closed')
			await expect(offer.getByRole('checkbox')).toHaveCount(0)
			await offer.getByRole('button', { name: 'Start Tryit Plus' }).click()

			await page.waitForURL(/\/settings\/subscription\?checkout=success/)
			await settle(page)
			// The session id stays in page data, never in the address a tag can read.
			await expect.poll(() => page.url()).not.toContain('cs_e2e_guest_1')

			expect(capturedBody).toMatchObject({
				planId: 'individual_yearly',
				locale: 'en-US',
			})
			expect(capturedBody).not.toMatchObject({ immediateSupplyConsent: true })
			expect(capturedHeaders['x-puzzled-signal-attribution']).toBeUndefined()
			expect(capturedHeaders['x-puzzled-signal-consent']).toBe('denied,denied,denied,denied')
			expect(capturedHeaders['x-puzzled-return-to']).toBe('/games/sudoku')

			// Post-payment unauthenticated claim prompt preserves return destination with zero secret leak.
			await expect(
				page.getByRole('heading', { name: 'Payment received — link your Tryit Plus' }),
			).toBeVisible()
			const signInLink = page.getByRole('link', { name: 'Sign in to link subscription' })
			await expect(signInLink).toBeVisible()
			const next = new URL(
				(await signInLink.getAttribute('href')) ?? '',
				page.url(),
			).searchParams.get('next')
			expect(next).toBe(
				'/settings/subscription?checkout=success&s=cs_e2e_guest_1&callbackUrl=%2Fgames%2Fsudoku',
			)
			expect(page.url()).not.toContain('clm_')
		})

		test('puts currency beside the offer and ignores unknown plan requests', async ({ page }) => {
			await page.goto('/pricing?plan=not-a-plan')
			await settle(page)
			const offer = page.locator('#plus')
			const yearly = offer.locator('input[value="year"]')
			test.skip((await yearly.count()) === 0, 'sales are closed')
			await expect(yearly).toBeChecked()
			const currency = page.getByRole('group', { name: 'Currency', exact: true })
			if ((await currency.count()) > 0) await expect(currency).toBeInViewport({ ratio: 1 })
		})

		test('has no horizontal overflow', async ({ page }) => {
			await openPricing(page)
			expect(
				await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1),
			).toBe(false)
		})
	})
}

const THEME_MODES = ['light', 'dark'] as const

const CAPTURE_VIEWPORTS = [
	{ name: 'desktop-1440x900', width: 1440, height: 900 },
	{ name: 'mobile-390x844', width: 390, height: 844 },
] as const

const CURRENCY_CAPTURES = [
	{
		code: 'usd',
		starter: '$2.99',
		plusYearly: '$39.99',
		familyYearly: '$64.99',
	},
	{
		code: 'gbp',
		starter: '£2.99',
		plusYearly: '£29.99',
		familyYearly: '£47.99',
	},
	{
		code: 'jpy',
		starter: '¥479',
		plusYearly: '¥6,399',
		familyYearly: '¥10,389',
	},
	{
		code: 'idr',
		starter: /IDR\s*59,000(?!\.00)/,
		plusYearly: /IDR\s*729,000(?!\.00)/,
		plusMonthlyEq: /IDR\s*60,750(?!\.00)/,
		familyYearly: /IDR\s*1,189,000(?!\.00)/,
		familyMonthlyEq: /IDR\s*99,083(?!\.\d)/,
		free: /IDR\s*0(?!\.00)/,
	},
	{
		code: 'hkd',
		starter: /HK\$29(?!\.00)/,
		plusYearly: /HK\$319(?!\.00)/,
		plusMonthlyEq: 'HK$26.58',
		familyYearly: /HK\$519(?!\.00)/,
		free: /HK\$0(?!\.00)/,
	},
] as const

for (const viewport of CAPTURE_VIEWPORTS) {
	for (const colorScheme of THEME_MODES) {
		test.describe(`Pricing 16-currency matrix (${viewport.name}, ${colorScheme})`, () => {
			test.use({
				viewport: { width: viewport.width, height: viewport.height },
				colorScheme,
			})

			test('switches USD, GBP, JPY, IDR and HKD without overflow', async ({ page }, testInfo) => {
				await openPricing(page)
				const plus = page.locator('#plus')
				const yearly = plus.getByRole('radio', { name: /^Yearly/ })
				test.skip((await yearly.count()) === 0, 'sales are closed: no currency switcher')

				if (colorScheme === 'dark') {
					await expect(page.locator('html')).toHaveClass(/\bdark\b/)
				}

				const decline = page.getByRole('button', { name: 'Decline', exact: true })
				if (await decline.isVisible()) {
					await decline.click()
					await expect(decline).toHaveCount(0)
				}

				const select = page.getByRole('combobox', { name: 'Currency', exact: true })
				await expect(select).toBeVisible()
				await expect(select.locator('option')).toHaveCount(16)

				const family = page.locator('#family')
				for (const target of CURRENCY_CAPTURES) {
					if ((await select.inputValue()) !== target.code) {
						await select.selectOption(target.code)
					}
					await expect(select).toHaveValue(target.code)
					await expect(plus).toContainText(target.starter)
					await expect(plus).toContainText(target.plusYearly)
					if ('plusMonthlyEq' in target) {
						await expect(plus).toContainText(target.plusMonthlyEq)
					}
					await expect(family).toContainText(target.familyYearly)
					if ('familyMonthlyEq' in target) {
						await expect(family).toContainText(target.familyMonthlyEq)
					}
					if ('free' in target) {
						await expect(page.locator('#plans')).toContainText(target.free)
					}

					expect(
						await page.evaluate(() => document.documentElement.scrollWidth),
					).toBeLessThanOrEqual(viewport.width)

					const box = await select.boundingBox()
					expect(box).not.toBeNull()
					if (box) {
						expect(box.x).toBeGreaterThanOrEqual(0)
						expect(box.x + box.width).toBeLessThanOrEqual(viewport.width)
					}

					await page.evaluate(() => window.scrollTo(0, 0))
					await settle(page)
					const shotName = `pricing-${viewport.name}-${colorScheme}-${target.code}.png`
					await testInfo.attach(shotName, {
						body: await page.screenshot({
							fullPage: false,
							path: testInfo.outputPath(shotName),
						}),
						contentType: 'image/png',
					})
					if (viewport.width === 390 && target.code === 'idr') {
						const fullName = `pricing-${viewport.name}-${colorScheme}-idr-full.png`
						await testInfo.attach(fullName, {
							body: await page.screenshot({
								fullPage: true,
								path: testInfo.outputPath(fullName),
							}),
							contentType: 'image/png',
						})
					}
				}
			})
		})
	}
}
test.describe('Post-payment verified-email handoff and auth brand panel contrast', () => {
	test.use({ viewport: { width: 1440, height: 900 } })

	test('preserves session_id across signed-out /settings/subscription → /sign-in without claim cookie', async ({
		page,
	}) => {
		await page.goto('/settings/subscription?checkout=success&session_id=cs_live_verify_probe', {
			waitUntil: 'domcontentloaded',
		})
		await settle(page)

		await expect(
			page.getByRole('heading', { name: 'Payment received — link your Tryit Plus' }),
		).toBeVisible()
		const expectedCallback = encodeURIComponent(
			'/settings/subscription?checkout=success&session_id=cs_live_verify_probe',
		)
		const signIn = page.getByRole('link', { name: 'Sign in to link subscription' })
		await expect(signIn).toHaveAttribute('href', `/sign-in?next=${expectedCallback}`)

		await signIn.click()
		await page.waitForURL(`**/sign-in?next=${expectedCallback}`)
		await expect(page.getByRole('heading', { name: 'Sign in to Tryit' })).toBeVisible()
	})

	for (const colorScheme of ['light', 'dark'] as const) {
		test(`auth brand panel maintains WCAG AA contrast on dark ink surface in ${colorScheme} mode`, async ({
			page,
		}) => {
			await page.emulateMedia({ colorScheme })
			for (const authPath of ['/sign-in']) {
				await page.goto(authPath, { waitUntil: 'domcontentloaded' })
				await settle(page)
				const panel = page.locator('aside.surface-ink')
				await expect(panel).toBeVisible()

				const report = await panel.evaluate((aside) => {
					const parseRgba = (raw: string): [number, number, number, number] => {
						const canvas = document.createElement('canvas')
						canvas.width = 1
						canvas.height = 1
						const ctx = canvas.getContext('2d')
						if (!ctx) return [0, 0, 0, 1]
						ctx.clearRect(0, 0, 1, 1)
						ctx.fillStyle = raw
						ctx.fillRect(0, 0, 1, 1)
						const d = ctx.getImageData(0, 0, 1, 1).data
						return [d[0], d[1], d[2], d[3] / 255]
					}
					const composite = (
						fg: [number, number, number, number],
						bg: [number, number, number],
					): [number, number, number] => [
						fg[0] * fg[3] + bg[0] * (1 - fg[3]),
						fg[1] * fg[3] + bg[1] * (1 - fg[3]),
						fg[2] * fg[3] + bg[2] * (1 - fg[3]),
					]
					const luminance = ([r, g, b]: [number, number, number]) => {
						const chan = (v: number) => {
							const s = v / 255
							return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4
						}
						return 0.2126 * chan(r) + 0.7152 * chan(g) + 0.0722 * chan(b)
					}
					const contrast = (a: [number, number, number], b: [number, number, number]) => {
						const l1 = luminance(a)
						const l2 = luminance(b)
						return (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05)
					}

					const bgRgba = parseRgba(getComputedStyle(aside).backgroundColor)
					const bg: [number, number, number] = [bgRgba[0], bgRgba[1], bgRgba[2]]
					const textNodes = Array.from(aside.querySelectorAll('h2, p, li, a'))
					const textMin = Math.min(
						...textNodes.map((el) =>
							contrast(composite(parseRgba(getComputedStyle(el).color), bg), bg),
						),
					)
					const checks = Array.from(aside.querySelectorAll('ul svg'))
					const checkMin = Math.min(
						...checks.map((el) =>
							contrast(composite(parseRgba(getComputedStyle(el).color), bg), bg),
						),
					)
					return { textCount: textNodes.length, textMin, checkCount: checks.length, checkMin }
				})

				expect(report.textCount).toBe(6)
				expect(report.textMin).toBeGreaterThanOrEqual(7)
				expect(report.checkCount).toBe(3)
				expect(report.checkMin).toBeGreaterThanOrEqual(4.5)
			}
		})
	}
})

// Independent display expectations for the five published plans on the open-store fixture.
const CHECKOUT_PLANS = [
	{ id: 'individual_once', offer: 'plus', interval: 'once' },
	{ id: 'individual_monthly', offer: 'plus', interval: 'month' },
	{ id: 'individual_yearly', offer: 'plus', interval: 'year' },
	{ id: 'family_monthly', offer: 'family', interval: 'month' },
	{ id: 'family_yearly', offer: 'family', interval: 'year' },
] as const
const CHECKOUT_PRICES = {
	eur: ['€2.99', '€4.99', '€36.99', '€7.99', '€58.99'],
	usd: ['$2.99', '$4.99', '$39.99', '$7.99', '$64.99'],
	jpy: ['¥479', '¥799', '¥6,399', '¥1,279', '¥10,389'],
	twd: ['NT$99', 'NT$169', 'NT$1,319', 'NT$269', 'NT$2,149'],
}

for (const mobile of [false, true]) {
	test.describe(mobile ? 'Mobile checkout' : 'Desktop checkout', () => {
		test.use({
			viewport: mobile ? { width: 390, height: 844 } : { width: 1440, height: 900 },
			isMobile: mobile,
			hasTouch: mobile,
		})

		for (const [currency, prices] of Object.entries(CHECKOUT_PRICES)) {
			test(`all five plans send the selected ${currency.toUpperCase()} and only the pass requires a waiver`, async ({
				page,
				context,
				baseURL,
			}) => {
				if (!baseURL) throw new Error('Pricing requires a browser base URL')
				await context.addCookies([{ name: 'puzzled_currency', value: currency, url: baseURL }])
				await page.addInitScript((key) => localStorage.setItem(key, 'denied'), CONSENT_KEY)
				await page.route('**/v1/guest/session', (route) =>
					route.fulfill({ json: { issued: true } }),
				)
				const checkoutRequests: unknown[] = []
				// Intercept every checkout: verify the actual client payload without creating sessions.
				await page.route('**/puzzled.v1.BillingService/CreateCheckout', (route) => {
					checkoutRequests.push(route.request().postDataJSON())
					return route.fulfill({ status: 503, json: { code: 'unavailable' } })
				})
				const { promise: held, resolve: release } = Promise.withResolvers<void>()
				await page.route('**/_build/assets/entry-client-*.js', async (route) => {
					await held
					await route.continue()
				})

				const plus = page.locator('#plus')
				const waiver = plus.getByRole('checkbox')
				const passCta = plus.getByRole('button', { name: 'Continue to payment', exact: true })
				const hydrated = page.waitForResponse('**/api/consent-context')
				try {
					await page.goto('/pricing?plan=individual_once', { waitUntil: 'domcontentloaded' })
					await expect(page.getByLabel('Currency', { exact: true })).toHaveValue(currency)
					await expect(waiver).not.toBeChecked()
					await expect(passCta).toBeDisabled()
					await waiver.check()
					await expect(waiver).toBeChecked()
					await expect(passCta).toBeDisabled() // native input changed, client still held
				} finally {
					release()
				}
				await hydrated
				await expect(passCta).toBeEnabled() // early consent must not need a second tick

				for (const [index, plan] of CHECKOUT_PLANS.entries()) {
					const offer = page.locator(`#${plan.offer}`)
					const radio = offer.locator(`input[type="radio"][value="${plan.interval}"]`)
					await expect(radio.locator('..').getByText(prices[index], { exact: true })).toBeVisible()
					await radio.check()
					const name =
						plan.offer === 'plus' && plan.interval !== 'once'
							? 'Start Tryit Plus'
							: 'Continue to payment'
					const cta = offer.getByRole('button', { name, exact: true })
					if (plan.interval !== 'once') await expect(offer.getByRole('checkbox')).toHaveCount(0)
					await expect(cta).toBeEnabled()
					await cta.click()
					await expect(offer.getByRole('alert')).toHaveText(
						'Checkout could not start. Please try again.',
					)
					expect(checkoutRequests).toHaveLength(index + 1)
					expect(checkoutRequests[index]).toEqual({
						planId: plan.id,
						locale: 'en-US',
						currency,
						...(plan.interval === 'once' ? { immediateSupplyConsent: true } : {}),
					})
				}

				await plus.locator('input[value="once"]').check()
				await expect(waiver).not.toBeChecked() // changing the offer resets the waiver
				await expect(passCta).toBeDisabled()
				await waiver.check()
				await expect(passCta).toBeEnabled()
				await waiver.uncheck()
				await expect(passCta).toBeDisabled()
				expect(checkoutRequests).toHaveLength(CHECKOUT_PLANS.length)
			})
		}
	})
}

test.describe('pricing currency switch keeps the chosen purchase', () => {
	test.use({ serviceWorkers: 'block' })

	test.beforeEach(async ({ page, context, baseURL }) => {
		if (!baseURL || !['localhost', '127.0.0.1'].includes(new URL(baseURL).hostname)) {
			throw new Error('The loopback open-plan fixture URL is required')
		}
		const origin = new URL(baseURL).origin
		await context.addCookies([{ name: CURRENCY_COOKIE, value: 'usd', url: origin }])
		await page.addInitScript((key) => localStorage.setItem(key, 'denied'), CONSENT_KEY)
		await context.route('**/*', (route) =>
			route.request().method() === 'GET' && new URL(route.request().url()).origin === origin
				? route.continue()
				: route.abort(),
		)
	})

	async function switchToPounds(page: Page) {
		const select = page.getByRole('combobox', { name: 'Currency', exact: true })
		await expect(select).toHaveValue('usd')
		const loaded = page.waitForEvent('domcontentloaded', { timeout: 10_000 })
		await select.press('ArrowDown')
		await loaded
		await expect(select).toHaveValue('gbp')
		return select
	}

	test('retains both Monthly selections, the localized quote, and keyboard focus', async ({
		page,
	}) => {
		await page.setViewportSize(DESKTOP)
		const original =
			'/en-GB/pricing?plan=individual_once&trigger=practice_upsell&callbackUrl=%2Farchive&utm_medium=cpc#plus'
		await page.goto(original)
		const plus = page.locator('#plus')
		const family = page.locator('#family')
		await expect(plus.locator('input[value="once"]')).toBeChecked()
		await plus.locator('input[value="month"]').check()
		await family.locator('input[value="month"]').check()
		const select = await switchToPounds(page)
		await expect(plus.locator('input[value="month"]')).toBeChecked()
		await expect(family.locator('input[value="month"]')).toBeChecked()
		await expect(plus.getByText(/^Renews every month at £3\.99\b/)).toBeVisible()
		await expect(family.getByText(/^Renews every month at £5\.99\b/)).toBeVisible()
		await expect(plus.getByRole('button', { name: 'Start Tryit Plus' })).toHaveAttribute(
			'data-checkout-trigger',
			'practice_upsell',
		)
		const before = new URL(original, page.url())
		const after = new URL(page.url())
		expect(after.pathname).toBe(before.pathname)
		expect(after.hash).toBe(before.hash)
		for (const [key, value] of before.searchParams) expect(after.searchParams.get(key)).toBe(value)
		await expect(select).toBeFocused()
		await expect(select).toHaveCSS('outline-style', 'solid')
		await expect(select).toBeInViewport()
	})

	for (const preset of [false, true]) {
		test(`keeps the ${preset ? 'preset' : 'manually chosen'} pass but asks for fresh consent`, async ({
			page,
		}) => {
			await page.setViewportSize(MOBILE)
			const ready = page.waitForResponse('**/api/consent-context')
			await page.goto(
				`/pricing?${preset ? 'plan=individual_once&' : ''}entry_surface=seo_vs-wordle#plus`,
			)
			await ready
			const plus = page.locator('#plus')
			const pass = plus.locator('input[value="once"]')
			const waiver = plus.getByRole('checkbox')
			const pay = plus.getByRole('button', { name: 'Continue to payment' })
			if (!preset) await pass.check()
			await expect(pass).toBeChecked()
			await expect(waiver).not.toBeChecked()
			await expect(pay).toBeDisabled()
			await waiver.check()
			await expect(pay).toBeEnabled()
			await switchToPounds(page)
			await expect(pass).toBeChecked()
			await expect(pass.locator('..')).toContainText('£2.99')
			await expect(waiver).not.toBeChecked()
			await expect(pay).toBeDisabled()
			await waiver.check()
			await expect(pay).toBeEnabled()
		})
	}

	test('clears a missing plan rather than silently switching to Yearly', async ({
		page,
		context,
	}) => {
		await page.goto('/pricing?plan=family_monthly#family')
		const family = page.locator('#family')
		await expect(family.locator('input[value="month"]')).toBeChecked()
		await context.addCookies([
			{
				name: '__Host-puzzled_guest',
				value: 'pricing-catalogue-change',
				domain: new URL(page.url()).hostname,
				path: '/',
				secure: true,
			},
		])
		await switchToPounds(page)
		await expect(family.locator('input[value="month"]')).toHaveCount(0)
		await expect(family.locator('input[type="radio"]:checked')).toHaveCount(0)
		await expect(family.getByRole('button', { name: 'Continue to payment' })).toHaveCount(0)
		await expect(
			page.getByText(
				'Your previous plan isn’t available in this currency. Choose a plan to continue.',
				{ exact: true },
			),
		).toBeVisible()
		await family.locator('input[value="year"]').check()
		await expect(family.getByRole('button', { name: 'Continue to payment' })).toBeEnabled()
	})
})

test('zh-TW pricing starts in TWD despite geo and preserves the currency switcher override', async ({
	page,
	context,
}) => {
	await page.setExtraHTTPHeaders({ 'cf-ipcountry': 'DE' })
	const ready = page.waitForResponse('**/api/consent-context')
	await page.goto('/zh-TW/pricing')
	await ready
	const select = page.getByLabel('幣別', { exact: true })
	const pass = page.locator('#plus input[value="once"]').locator('..')
	await expect(select).toHaveValue('twd')
	await expect(pass.getByText('NT$99', { exact: true })).toBeVisible()
	const reloaded = page.waitForEvent('domcontentloaded')
	await select.selectOption('jpy')
	await reloaded
	await expect(select).toHaveValue('jpy')
	await expect(pass).toContainText('¥479')
	expect(
		(await context.cookies()).find((cookie) => cookie.name === 'puzzled_currency')?.value,
	).toBe('jpy')
})

for (const [locale, path, label] of [
	['en-US', '/pricing', 'Start Tryit Plus'],
	['ja', '/ja/pricing', 'Tryit Plusを始める'],
	['es', '/es/pricing', 'Empezar con Tryit Plus'],
	['pt-BR', '/pt-BR/pricing', 'Começar com o Tryit Plus'],
]) {
	test(`${locale} flagship offer clears both docks at 390×844`, async ({ page }) => {
		await page.setViewportSize({ width: 390, height: 844 })
		await page.setExtraHTTPHeaders({ 'CF-IPCountry': 'DE' })
		await page.goto(path)
		await expect(page.locator('html')).toHaveAttribute('lang', locale)
		await expect(page.locator('[data-consent-banner]')).toBeVisible()
		await expect(page.locator('.site-tab-bar')).toBeVisible()
		await settle(page)
		const button = page.locator('#plus').getByRole('button', { name: label, exact: true })
		await expect(button).toBeEnabled()
		await expect(button.locator('svg')).toHaveClass(/lucide-arrow-right/)
		const termsId = await button.getAttribute('aria-describedby')
		expect(termsId).toBeTruthy()
		const finePrint = page.locator(`[id="${termsId}"]`)
		await expect(finePrint).toBeVisible()
		await expect(finePrint).toContainText(locale === 'ja' ? '14日' : '14')
		const geometry = await button.evaluate((el) => {
			const bounds = el.getBoundingClientRect()
			const dockTop = Math.min(
				...Array.from(
					document.querySelectorAll('[data-consent-banner], .site-tab-bar'),
					(dock) => dock.getBoundingClientRect().top,
				),
			)
			const card = el.closest('#plus')?.firstElementChild
			const benefits = card?.querySelector('ul')
			return {
				dockTop,
				cardBottom: card?.getBoundingClientRect().bottom ?? Infinity,
				benefitsBottom: benefits?.getBoundingClientRect().bottom ?? Infinity,
				buttonTop: bounds.top,
				buttonBottom: bounds.bottom,
				finePrintTop:
					document
						.getElementById(el.getAttribute('aria-describedby') ?? '')
						?.getBoundingClientRect().top ?? -1,
				overflow: document.documentElement.scrollWidth - innerWidth,
				scroll: scrollY,
			}
		})
		expect(geometry.cardBottom).toBeLessThanOrEqual(geometry.dockTop)
		expect(geometry.benefitsBottom).toBeLessThan(geometry.buttonTop)
		expect(geometry.finePrintTop).toBeGreaterThan(geometry.buttonBottom)
		expect(geometry.overflow).toBe(0)
		expect(geometry.scroll).toBe(0)
		expect((await new AxeBuilder({ page }).withTags(WCAG_TAGS).analyze()).violations).toEqual([])
	})
}

const gameBenefitCopy = {
	'en-US': [`All ${dailyCount} daily games`, `Unlimited practice in ${practiceCount} games`],
	'en-GB': [`All ${dailyCount} daily games`, `Unlimited practice in ${practiceCount} games`],
	es: [`Los ${dailyCount} juegos diarios`, `Práctica ilimitada en ${practiceCount} juegos`],
	ja: [`全${dailyCount}種類の日替わりゲーム`, `${practiceCount}種類のゲームで練習し放題`],
	'pt-BR': [`Todos os ${dailyCount} jogos diários`, `Prática ilimitada em ${practiceCount} jogos`],
	'zh-CN': [`全部 ${dailyCount} 款每日游戏`, `${practiceCount} 款游戏可不限次数练习`],
	'zh-HK': [`玩齊每日 ${dailyCount} 款遊戲`, `${practiceCount} 款遊戲，想練幾多次都得`],
	'zh-TW': [`暢玩全部 ${dailyCount} 款每日遊戲`, `${practiceCount} 款遊戲，想練幾次就練幾次`],
}

for (const [locale, [daily, practice]] of Object.entries(gameBenefitCopy)) {
	test(`pricing distinguishes daily play from practice for Plus and Family (${locale})`, async ({
		page,
	}) => {
		const prefix = locale === 'en-US' ? '' : `/${locale}`
		await page.goto(`${prefix}/pricing?trigger=practice_upsell`)
		await expect(page.locator('html')).toHaveAttribute('lang', locale)
		for (const id of ['plus', 'family']) {
			const offer = page.locator(`#${id}`)
			await expect(offer.getByText(daily, { exact: true })).toBeVisible()
			await expect(offer.getByText(practice, { exact: true })).toBeVisible()
			await expect(offer.locator('[data-checkout-trigger]')).toHaveAttribute(
				'data-checkout-trigger',
				'practice_upsell',
			)
		}
	})
}

const archiveWindowCopy = {
	'en-US': 'past 30 days',
	'en-GB': 'past 30 days',
	'zh-HK': '過去 30 日',
	'zh-TW': '過去 30 天',
	'zh-CN': '过去 30 天',
	ja: '過去30日分',
	es: 'últimos 30 días',
	'pt-BR': 'últimos 30 dias',
} as const

for (const [locale, copy] of Object.entries(archiveWindowCopy)) {
	test(`pricing and archive promise the same 30-day window (${locale})`, async ({ page }) => {
		const prefix = locale === 'en-US' ? '' : `/${locale}`
		await page.goto(`${prefix}/pricing`)
		await expect(page.locator('html')).toHaveAttribute('lang', locale)
		await expect(page.locator('main').getByText(copy).first()).toBeVisible()
		await expect(page.locator('meta[name="description"]')).toHaveAttribute(
			'content',
			new RegExp(copy),
		)
		await page.goto(`${prefix}/archive`)
		await expect(page.locator('html')).toHaveAttribute('lang', locale)
		// Hong Kong's archive SEO currently uses 天; 日 is used on the pricing and unlock cards.
		const archiveCopy = locale === 'zh-HK' ? '過去 30 天' : copy
		await expect(page.locator('meta[name="description"]')).toHaveAttribute(
			'content',
			new RegExp(archiveCopy),
		)
	})
}

for (const viewport of [
	{ width: 390, height: 844 },
	{ width: 1440, height: 900 },
]) {
	test(`buyer FAQ and live offers match rendered pricing at ${viewport.width}×${viewport.height}`, async ({
		page,
	}) => {
		await page.setViewportSize(viewport)
		await page.setExtraHTTPHeaders({ 'CF-IPCountry': 'GB' })
		await openPricing(page)
		const decline = page.getByRole('button', { name: 'Decline', exact: true })
		if (await decline.isVisible()) await decline.click()
		const plus = page.locator('#plus')
		await expect(plus.getByText('Completely ad-free', { exact: true })).toBeVisible()
		await expect(plus.getByText('Syncs across phone & desktop', { exact: true })).toBeVisible()
		await expect(page.locator('#family')).toContainText(
			'£1 per person per month with all 4 seats filled',
		)
		const scripts = await page.locator('script[type="application/ld+json"]').allTextContents()
		const schemas = scripts.map((script) => JSON.parse(script))
		const canonical = await page.locator('link[rel="canonical"]').getAttribute('href')
		const image = await page.locator('meta[property="og:image"]').getAttribute('content')
		const products = schemas.filter((schema) => schema['@type'] === 'Product')
		expect(products).toHaveLength(1)
		expect(products[0]).toMatchObject({
			name: 'Tryit Plus',
			url: canonical,
			image,
			offers: [
				...['3.99', '29.99', '5.99', '47.99', '2.99'].map((price) =>
					expect.objectContaining({ price, priceCurrency: 'GBP' }),
				),
			],
		})
		const faq = page.getByRole('region', { name: 'Questions about Tryit Plus' })
		const rows = faq.locator('details')
		await expect(rows).toHaveCount(4)
		const mainEntity = []
		for (const row of await rows.all()) {
			const summary = row.locator('summary')
			await summary.focus()
			await page.keyboard.press('Enter')
			await expect(row.locator('p')).toBeVisible()
			mainEntity.push({
				'@type': 'Question',
				name: await summary.textContent(),
				acceptedAnswer: { '@type': 'Answer', text: await row.locator('p').textContent() },
			})
		}
		expect(schemas.filter((schema) => schema['@type'] === 'FAQPage')).toEqual([
			{ '@context': 'https://schema.org', '@type': 'FAQPage', mainEntity },
		])
		expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBe(0)
	})
}
