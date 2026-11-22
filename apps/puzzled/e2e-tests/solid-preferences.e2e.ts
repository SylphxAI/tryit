import { expect, test } from '@playwright/test'
import { fixtureToken } from '../scripts/auth-fixture-facts'

const streakRoute = '**/puzzled.v1.GamificationService/ToggleAutoFreeze'

test.describe('Solid account preferences', () => {
	test.skip(
		process.env.SOLID_CONSOLE_FIXTURE !== '1',
		'requires the local Auth and console Connect fixtures',
	)

	test.beforeEach(async ({ context, baseURL }) => {
		await context.addCookies([{ url: baseURL!, name: 'puzzled_session', value: fixtureToken }])
	})

	test('preserves the legacy theme setting before hydration and follows system only when selected', async ({
		page,
	}) => {
		await page.emulateMedia({ colorScheme: 'light' })
		await page.addInitScript(() => {
			if (!sessionStorage.getItem('initialized')) {
				localStorage.setItem('theme', 'dark')
				sessionStorage.setItem('initialized', 'yes')
			}
		})
		// Prevent hydration so a matching class must be set by the nonced bootstrap.
		await page.route('**/*.js', (route) => route.abort())
		await page.goto('/settings/preferences')
		await expect(page.locator('html')).toHaveClass('dark')
		await page.unroute('**/*.js')
		await page.reload()
		await expect(page.getByRole('button', { name: 'Set theme to Dark' })).toHaveAttribute(
			'aria-pressed',
			'true',
		)
		await page.getByRole('button', { name: 'Set theme to Light' }).press('Enter')
		await page.emulateMedia({ colorScheme: 'dark' })
		await expect(page.locator('html')).not.toHaveClass('dark')
		await page.reload()
		await expect(page.getByRole('button', { name: 'Set theme to Light' })).toHaveAttribute(
			'aria-pressed',
			'true',
		)
		await page.getByRole('button', { name: 'Set theme to System' }).click()
		await expect(page.locator('html')).toHaveClass('dark')
		await page.emulateMedia({ colorScheme: 'light' })
		await expect(page.locator('html')).not.toHaveClass('dark')
	})

	test('switches and remembers language on the same page without leaking the cache across visitors', async ({
		page,
		context,
		request,
	}) => {
		const unprefixed = '/settings/preferences?from=profile'
		await page.setViewportSize({ width: 390, height: 844 })
		await page.goto('/settings/preferences')
		const choice = page.locator('main summary')
		await choice.press('Enter')
		await page.getByRole('link', { name: 'Español', exact: true }).click()
		await expect(page).toHaveURL('/es/settings/preferences')
		await expect(page.locator('html')).toHaveAttribute('lang', 'es')
		expect((await context.cookies()).find(({ name }) => name === 'NEXT_LOCALE')?.value).toBe('es')
		const redirect = await context.request.get(unprefixed, { maxRedirects: 0 })
		expect(redirect.status()).toBe(307)
		expect(redirect.headers().location).toBe('/es/settings/preferences?from=profile')
		expect(redirect.headers()['cache-control']).toBe('private, no-store')
		const visitor = await request.get(unprefixed, { maxRedirects: 0 })
		expect(visitor.headers().location).toBe('/sign-in?callbackUrl=%2Fsettings%2Fpreferences')
		await expect(choice).toBeVisible()
		expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(390)
		await choice.press('Enter')
		await page.getByRole('link', { name: 'English (US)', exact: true }).click()
		await expect(page).toHaveURL('/settings/preferences')
		await expect(page.locator('html')).toHaveAttribute('lang', 'en-US')
		expect((await context.cookies()).find(({ name }) => name === 'NEXT_LOCALE')?.value).toBe(
			'en-US',
		)
	})

	test('uses the returned switch state and keeps it stable when a later save is rejected', async ({
		page,
	}) => {
		const writes: boolean[] = []
		await page.route(streakRoute, async (route) => {
			// Connect's protobuf JSON omits the default false scalar.
			const payload = route.request().postDataJSON() as { enabled?: boolean }
			writes.push(payload.enabled ?? false)
			if (writes.length === 3) {
				await route.fulfill({ status: 503, json: { code: 'unavailable' } })
				return
			}
			await route.fulfill({
				json: { info: { currentStreak: 4, autoFreezeEnabled: writes.length === 1 } },
			})
		})
		await page.goto('/settings/preferences')
		const toggle = page.getByRole('switch', { name: 'Auto-Freeze' })
		await expect(toggle).toHaveAttribute('aria-checked', 'true')
		await toggle.click()
		await expect.poll(() => writes.length).toBe(1)
		await expect(toggle).toBeEnabled()
		await expect(toggle).toHaveAttribute('aria-checked', 'true')
		await toggle.click()
		await expect(toggle).toHaveAttribute('aria-checked', 'false')
		await toggle.click()
		await expect(
			page.getByText('Your change was not saved. Try again.', { exact: true }),
		).toBeVisible()
		await expect(toggle).toHaveAttribute('aria-checked', 'false')
		expect(writes).toEqual([false, false, true])
	})

	test('unavailable reads render no writable default', async ({ page, context, baseURL }) => {
		const response = await context.request.get('/settings/preferences', {
			headers: { cookie: `puzzled_session=${fixtureToken}; __Host-puzzled_guest=unavailable` },
		})
		expect(response.status()).toBe(200)
		expect(response.headers()['cache-control']).toBe('private, no-store')
		await page.route('**/settings/preferences', (route) => route.fulfill({ response }))
		await page.goto(new URL('/settings/preferences', baseURL).href)
		await expect(
			page.getByText('Auto-freeze could not be loaded. Refresh to try again.', { exact: true }),
		).toBeVisible()
		await expect(page.getByRole('switch')).toHaveCount(0)
	})
})
