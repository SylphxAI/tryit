import { expect, test } from '@playwright/test'

// Run against the Solid production build with the open-plan puzzle fixture as API_INTERNAL_URL.
test('archive calendar and category link to the chosen past day without starting a game', async ({
	page,
}) => {
	await page.setViewportSize({ width: 360, height: 750 })
	const requests: Record<string, unknown>[] = []
	await page.route('**/puzzled.v1.PuzzleService/*', (route) => {
		expect(new URL(route.request().url()).pathname).toBe('/puzzled.v1.PuzzleService/GetDaily')
		requests.push(route.request().postDataJSON())
		return route.fulfill({
			status: 403,
			json: { code: 'permission_denied', message: 'plus_required_archive' },
		})
	})
	const response = await page.goto('/archive')
	expect(response?.headers()['cache-control']).toBe('private, no-store')
	await expect(page.getByRole('heading', { name: 'Your puzzle archive' })).toBeVisible()
	const dates = page.getByRole('group', { name: 'Pick a day' }).getByRole('button')
	const games = page.locator('[data-archive-almanac] a')
	await expect(dates).toHaveCount(30)
	await expect(games).toHaveCount(19)
	const original = await page.locator('#archive-day-title time').getAttribute('datetime')
	await dates.nth(1).click()
	await expect(dates.nth(1)).toHaveAttribute('aria-pressed', 'true')
	const selected = await page.locator('#archive-day-title time').getAttribute('datetime')
	expect(selected).toMatch(/^[0-9]{4}-[0-9]{2}-[0-9]{2}$/)
	expect(selected).not.toBe(original)
	await page.getByRole('button', { name: 'Word', exact: true }).click()
	await expect(page.getByRole('button', { name: 'Word', exact: true })).toHaveAttribute(
		'aria-pressed',
		'true',
	)
	await expect(page.locator('[data-archive-almanac] a[href^="/games/sudoku?"]')).toHaveCount(0)
	const link = page.locator('[data-archive-almanac] a[href^="/games/word-search?"]')
	await expect(link).toHaveAttribute('href', `/games/word-search?mode=archive&date=${selected}`)
	expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(360)
	expect(requests).toEqual([])
	await link.click()
	await expect(page.locator('[data-unlock-panel="archive"]')).toBeVisible()
	await expect(
		page.getByRole('heading', { name: 'Past days are part of Tryit Plus' }),
	).toBeVisible()
	expect(requests).toEqual([{ gameSlug: 'word-search', puzzleDate: selected }])
})

test('archive pass needs consent, retains archive return, and changes every price with currency', async ({
	page,
}) => {
	await page.setViewportSize({ width: 360, height: 750 })
	const requests: { body: unknown; returnTo?: string }[] = []
	await page.route('**/puzzled.v1.BillingService/CreateCheckout', (route) => {
		requests.push({
			body: route.request().postDataJSON(),
			returnTo: route.request().headers()['x-puzzled-return-to'],
		})
		return route.fulfill({ status: 503, json: { code: 'unavailable', message: 'fixture_only' } })
	})
	await page.goto('/archive')
	const mobile = page.locator('[data-archive-mobile-unlock]')
	await expect(mobile.getByRole('link', { name: 'Unlock archive' })).toHaveAttribute(
		'href',
		'#archive-unlock',
	)
	await expect(mobile).toContainText('3-day pass $')
	const offer = page.locator('#archive-unlock')
	const currency = offer.getByRole('combobox', { name: 'Currency' })
	await expect(currency).toHaveValue('usd')
	await currency.selectOption('gbp')
	await expect(currency).toHaveValue('gbp')
	await expect(mobile).toContainText('3-day pass £')
	const checkout = offer.locator('[data-checkout-trigger="archive_banner"]')
	const waiver = offer.getByRole('checkbox')
	await expect(waiver).toBeVisible()
	await expect(checkout).toBeDisabled()
	expect(requests).toEqual([])
	await waiver.check()
	await checkout.click()
	await expect(offer.getByRole('alert')).toContainText('Checkout could not start')
	expect(requests).toEqual([
		{
			body: {
				planId: 'individual_once',
				locale: 'en-US',
				currency: 'gbp',
				immediateSupplyConsent: true,
			},
			returnTo: '/archive',
		},
	])
	await offer.getByRole('radio', { name: /^Yearly/ }).check()
	await expect(waiver).toHaveCount(0)
	await expect(checkout).toBeEnabled()
	const compare = offer.getByRole('link', { name: /compare/i })
	await expect(compare).toHaveAttribute(
		'href',
		'/pricing?callbackUrl=%2Farchive&trigger=archive_banner',
	)
})
