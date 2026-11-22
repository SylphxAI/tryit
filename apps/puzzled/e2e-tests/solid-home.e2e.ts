import { expect, test } from '@playwright/test'
import { productDayKey } from '../src/lib/product-day'

test('home serves the localized daily lineup, canonical metadata and FAQ without JavaScript', async ({
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
		for (const [path, lang, headline] of [
			['/', 'en-US', /19 daily puzzles/i],
			['/es', 'es', /19 puzzles diarios/i],
		] as const) {
			const response = await page.goto(path)
			expect(response?.status()).toBe(200)
			expect(response?.headers()['cache-control']).toBe('private, no-store')
			await expect(page.locator('html')).toHaveAttribute('lang', lang)
			await expect(page).toHaveTitle(/Tryit/)
			await expect(page.locator('link[rel="canonical"]')).toHaveAttribute(
				'href',
				path === '/' ? 'https://tryit.fun' : 'https://tryit.fun/es',
			)
			await expect(page.locator('link[hreflang="x-default"]')).toHaveCount(1)
			await expect(page.getByRole('heading', { level: 1 })).toHaveText(headline)
			await expect(page.locator('[data-home-countdown]')).toHaveText(/^[0-9]{2}:[0-9]{2}:[0-9]{2}$/)
			const lineup = page.locator('[data-home-game]')
			await expect(lineup).toHaveCount(19)
			const featured = page.locator('[data-home-featured]')
			const slug = await featured.getAttribute('data-home-featured')
			expect(slug).toBeTruthy()
			await expect(lineup.first()).toHaveAttribute('data-home-game', slug ?? '')
			const href = await featured.getAttribute('href')
			const game = new URL(href ?? '', 'https://tryit.fun')
			expect(game.pathname).toBe(`${path === '/' ? '' : path}/games/${slug}`)
			expect(game.searchParams.get('start')).toBe('1')
			expect(game.hash).toBe('#play')
			const faq = page.locator('#home-faq')
			await expect(faq.locator('details')).toHaveCount(6)
			const schema = await page.locator('main script[type="application/ld+json"]').allTextContents()
			expect(schema.map((value) => JSON.parse(value)['@type'])).toEqual([
				'WebApplication',
				'FAQPage',
			])
			await faq.locator('summary').first().focus()
			await page.keyboard.press('Enter')
			await expect(faq.locator('details[open]')).toHaveCount(1)
		}
		const nonLocale = await page.goto('/not-a-locale')
		expect(nonLocale?.status()).toBe(404)
	} finally {
		await context.close()
	}
})

test('home mirrors the product day’s local picks and preserves localized navigation', async ({
	page,
}) => {
	await page.addInitScript((day) => {
		localStorage.setItem('puzzled:picks:2000-01-01', '["sudoku","word-search","nonogram"]')
		localStorage.setItem(`puzzled:picks:${day}`, '["sudoku","word-search"]')
	}, productDayKey())
	await page.goto('/es')
	await expect(page.locator('[data-daily-picks="2"]')).toBeVisible()
	const countdown = page.locator('[data-home-countdown]')
	const initial = await countdown.textContent()
	await expect(countdown).not.toHaveText(initial ?? '')
	await page.evaluate((day) => {
		localStorage.setItem(`puzzled:picks:${day}`, '["sudoku","word-search","nonogram"]')
		window.dispatchEvent(new Event('puzzled:picks-change'))
	}, productDayKey())
	await expect(page.locator('a[data-daily-picks="3"]')).toHaveAttribute(
		'href',
		/^\/es\/pricing\?.*entry_surface=picks_pill/,
	)
	await page.locator('#main-content a[href^="/es/games?category="]').first().click()
	await expect(page).toHaveURL(/\/es\/games\?category=/)
})

test('home only marks completion proved for the current viewer and day', async ({ request }) => {
	test.skip(process.env.CONSOLE_FIXTURE !== '1', 'Requires the loopback Connect console fixture')
	for (const [guest, status] of [
		['console-guest', 'solved'],
		['home-stale', 'play'],
	] as const) {
		const response = await request.get('/', {
			headers: { cookie: `__Host-puzzled_guest=${guest}; unrelated_cookie=must-not-forward` },
		})
		expect(response.status()).toBe(200)
		expect(response.headers()['cache-control']).toBe('private, no-store')
		const html = await response.text()
		const sudoku = html.match(/<a [^>]*data-home-game="sudoku"[^>]*>/)?.[0] ?? ''
		if (status === 'solved') {
			expect(sudoku).toContain('data-home-status="solved"')
			expect(sudoku).toContain('href="/games/sudoku"')
		} else expect(sudoku).not.toContain('data-home-status="solved"')
	}
	const anonymous = await request.get('/')
	expect(await anonymous.text()).not.toContain('data-home-status="solved"')
})
