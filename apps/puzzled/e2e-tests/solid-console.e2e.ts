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
		await expect(page.locator('a[href*="leaderboard"]')).toHaveCount(0)
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
})
