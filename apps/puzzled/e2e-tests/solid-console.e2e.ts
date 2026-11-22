import { expect, test } from '@playwright/test'
import { fixtureToken } from '../scripts/auth-fixture-facts'

test.describe('Solid player console', () => {
	test.skip(
		process.env.SOLID_CONSOLE_FIXTURE !== '1',
		'requires local Auth and console Connect fixtures',
	)

	test('keeps a signed-out profile private and preserves a localized return', async ({
		request,
		baseURL,
	}) => {
		const response = await request.get('/zh-HK/profile?callbackUrl=https://external.example', {
			maxRedirects: 0,
		})
		expect(response.status()).toBe(302)
		expect(response.headers()['cache-control']).toBe('private, no-store')
		const next = new URL(response.headers().location, baseURL)
		expect(next.origin).toBe(new URL(baseURL!).origin)
		expect(next.pathname).toBe('/zh-HK/sign-in')
		expect(next.searchParams.get('callbackUrl')).toBe('/zh-HK/profile')
		expect(await response.text()).not.toContain('synthetic@example.test')
	})

	test('renders only the verified session’s profile and labels unreadable progress', async ({
		page,
		context,
		baseURL,
		request,
	}) => {
		await context.addCookies([
			{ url: baseURL, name: 'puzzled_session', value: fixtureToken },
			{ url: baseURL, name: 'unrelated_cookie', value: 'must-not-forward' },
		])
		const response = await page.goto('/profile')
		expect(response?.status()).toBe(200)
		expect(response?.headers()['cache-control']).toBe('private, no-store')
		await expect(page.locator('meta[name=robots]')).toHaveAttribute('content', 'noindex, nofollow')
		await expect(page.getByRole('heading', { name: 'Your profile' })).toBeVisible()
		await expect(page.getByText('synthetic@example.test', { exact: true })).toBeVisible()
		await expect(page.locator('dl dd')).toHaveText(['8', '75%', '4'])
		await expect(page.getByRole('link', { name: 'Manage account settings' })).toHaveAttribute(
			'href',
			'/settings/account',
		)
		const other = await request.get('/profile', {
			headers: { cookie: 'puzzled_session=invalid' },
			maxRedirects: 0,
		})
		expect(other.status()).toBe(302)
		expect(await other.text()).not.toContain('synthetic@example.test')
		const unavailable = await request.get('/profile', {
			headers: { cookie: `puzzled_session=${fixtureToken}; __Host-puzzled_guest=unavailable` },
		})
		expect(unavailable.status()).toBe(200)
		expect(await unavailable.text()).toContain('Part of your record did not load')
		expect(await unavailable.text()).not.toContain('75%')
	})

	test('changes period with keyboard, keeps module and period in the URL and distinguishes failure from empty', async ({
		page,
	}) => {
		const response = await page.goto('/leaderboard?period=today&module=sudoku')
		expect(response?.headers()['cache-control']).toBe('private, no-store')
		await expect(page.getByRole('cell', { name: 'Fixture player' })).toBeVisible()
		await expect(page.getByRole('cell', { name: '321' })).toBeVisible()
		const today = page.getByRole('tab', { name: 'Today' })
		const week = page.getByRole('tab', { name: 'This Week' })
		await today.focus()
		await today.press('ArrowRight')
		await expect(week).toBeFocused()
		await expect(today).toHaveAttribute('aria-selected', 'true')
		await week.press('Enter')
		await expect(week).toHaveAttribute('aria-selected', 'true')
		await expect(page).toHaveURL(/period=week&module=sudoku$/)
		await expect(page.getByText('This board is still warming up')).toBeVisible()
		await expect(page.getByRole('link', { name: 'Play Sudoku', exact: true })).toHaveAttribute(
			'href',
			'/games/sudoku',
		)

		await page.getByLabel('Puzzle', { exact: true }).selectOption('crossword')
		await expect(page).toHaveURL(/period=week&module=crossword$/)
		await expect(page.getByText('This board did not load')).toBeVisible()
		await expect(page.getByText('This board is still warming up')).toHaveCount(0)
		await expect(page.getByRole('table')).toHaveCount(0)
		await expect(page.getByRole('link', { name: 'Try this board again' })).toHaveAttribute(
			'href',
			'/leaderboard?period=week&module=crossword',
		)
	})

	test('keeps the viewer marker private and never serializes opaque entry identifiers', async ({
		request,
	}) => {
		const url = '/leaderboard?period=all&module=sudoku'
		const viewer = await request.get(url, {
			headers: { cookie: `puzzled_session=${fixtureToken}` },
		})
		const publicBoard = await request.get(url)
		const own = await viewer.text()
		const publicHtml = await publicBoard.text()
		expect(viewer.headers()['cache-control']).toBe('private, no-store')
		expect(publicBoard.headers()['cache-control']).toBe('private, no-store')
		expect(own).toMatch(/>You<\//)
		expect(publicHtml).not.toMatch(/>You<\//)
		expect(own).not.toContain('opaque-only')
		expect(publicHtml).not.toContain('opaque-only')
	})
})
