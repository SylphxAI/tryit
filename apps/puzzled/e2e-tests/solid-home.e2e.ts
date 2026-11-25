import { expect, test } from '@playwright/test'
import { gamePath } from '../src/lib/game-slug'
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
			['/es', 'es', /19 puzles diarios/i],
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
			await expect(lineup).toHaveCount(18)
			const featured = page.locator('[data-home-featured]')
			const slug = await featured.getAttribute('data-home-featured')
			if (!slug) throw new Error('Featured tile is missing its game slug')
			await expect(lineup.and(page.locator(`[data-home-game="${slug}"]`))).toHaveCount(0)
			const href = await featured.getAttribute('href')
			const game = new URL(href ?? '', 'https://tryit.fun')
			expect(game.pathname).toBe(`${path === '/' ? '' : path}${gamePath(slug)}`)
			expect(game.searchParams.get('start')).toBe('1')
			expect(game.hash).toBe('#play')
			const faq = page.locator('#home-faq')
			await expect(faq.locator('details')).toHaveCount(6)
			const schema = await page.locator('main script[type="application/ld+json"]').allTextContents()
			expect(schema.map((value) => JSON.parse(value)['@type'])).toEqual([
				'WebApplication',
				'SoftwareApplication',
				'Product',
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

test('home mirrors the product day’s server picks and preserves localized navigation', async ({
	page,
}) => {
	// The cap fixture is served with FIXTURE_OPEN_PLANS=1, separate from the console fixture.
	const url = process.env.HOME_PICKS_BASE_URL
		? new URL('/es', process.env.HOME_PICKS_BASE_URL).href
		: '/es'
	await page.addInitScript((day) => {
		// A contradictory legacy cache must not supply today's picks.
		localStorage.setItem(`puzzled:picks:${day}`, '["sudoku","word-search"]')
	}, productDayKey())
	await page.goto(url)
	await expect(page.locator('p[data-daily-picks="0"]')).toHaveText(
		'Hoy has usado 0 de tus 3 jugadas gratis',
	)
	await expect(page.locator('a[data-daily-picks]')).toHaveCount(0)
	const countdown = page.locator('[data-home-countdown]')
	const initial = await countdown.textContent()
	await expect(countdown).not.toHaveText(initial ?? '')

	// Only this fixture identity gets three current-day claims from GetTodayProgress.
	await page.context().addCookies([
		{
			name: '__Host-puzzled_guest',
			value: 'cap-fixture',
			domain: new URL(page.url()).hostname,
			path: '/',
			secure: true,
			httpOnly: true,
		},
	])
	await page.reload()
	const full = page.locator('a[data-daily-picks="3"]')
	await expect(full).toHaveText('Hoy has usado 3 de tus 3 jugadas gratis')
	await expect(full).toHaveAttribute(
		'href',
		'/es/pricing?utm_source=tryit&utm_medium=picks_pill&entry_surface=picks_pill',
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
		const featuredSudoku = html.match(/<a [^>]*data-home-featured="sudoku"[^>]*>/)?.[0]
		if (status === 'solved') {
			if (!featuredSudoku) expect(sudoku).toContain('data-home-status="solved"')
			expect(featuredSudoku ?? sudoku).toContain('href="/games/sudoku"')
		} else expect(featuredSudoku ?? sudoku).toContain('difficulty=medium')
	}
	const anonymous = await request.get('/')
	expect(await anonymous.text()).not.toContain('data-home-status="solved"')
})
