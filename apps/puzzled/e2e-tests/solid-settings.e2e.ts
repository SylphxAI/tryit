import { expect, type Page, test } from '@playwright/test'
import { fixtureToken } from '../scripts/auth-fixture-facts'

const authFixture = process.env.SOLID_AUTH_FIXTURE_URL
const erasure = '**/puzzled.v1.PreferencesService/DeleteAccountData'
const memberCookie = (baseURL: string) => ({
	url: baseURL,
	name: 'puzzled_session',
	value: fixtureToken,
})

async function fixture(
	mode?: string,
): Promise<{ path: string; body: Record<string, unknown> | null }[]> {
	const response = await fetch(
		new URL('/__fixture', authFixture),
		mode
			? {
					method: 'POST',
					headers: { 'content-type': 'application/json' },
					body: JSON.stringify({ mode }),
				}
			: undefined,
	)
	return (await response.json()).calls
}

async function showDeletion(page: Page) {
	await page.getByRole('button', { name: 'Delete my data' }).click()
	const dialog = page.getByRole('dialog', { name: 'Delete all your Tryit data?' })
	await expect(dialog).toBeVisible()
	await expect(dialog.getByRole('button', { name: 'Keep my data' })).toBeFocused()
	return dialog
}

test.describe('Solid signed-in settings', () => {
	test.describe.configure({ mode: 'serial' })
	test.beforeEach(async () => {
		test.skip(!authFixture, 'requires the local Auth fixture and Solid production build')
		await fixture('enabled')
	})

	test('guest responses never contain settings data and preserve the localized sign-in return', async ({
		request,
	}) => {
		for (const path of [
			'/settings',
			'/settings/profile',
			'/settings/account',
			'/settings/security',
			'/es/settings/privacy',
		]) {
			const response = await request.get(path, { maxRedirects: 0 })
			const signIn = path.startsWith('/es/') ? '/es/sign-in' : '/sign-in'
			expect(response.status()).toBe(302)
			expect(response.headers()['cache-control']).toBe('private, no-store')
			expect(response.headers().location).toBe(`${signIn}?callbackUrl=${encodeURIComponent(path)}`)
			expect(await response.text()).not.toContain('synthetic@example.test')
		}
	})

	test('renders a single h1, mobile navigation, localized privacy links and no account id outside Account', async ({
		page,
		context,
		baseURL,
	}) => {
		await context.addCookies([memberCookie(baseURL!)])
		await page.setViewportSize({ width: 390, height: 844 })
		await page.goto('/settings')
		await expect(
			page.getByText('Signed in as synthetic@example.test', { exact: true }),
		).toBeVisible()
		const nav = page.getByRole('navigation', { name: 'Settings sections' })
		await expect(nav.locator('[aria-current=page]')).toHaveAttribute('href', '/settings')
		await nav.getByRole('link', { name: 'Profile', exact: true }).click()
		await expect(page.locator('h1')).toHaveCount(1)
		await expect(page.locator('h1')).toHaveText('Settings')
		await expect(page.locator('h2').first()).toHaveText('Profile')
		await expect(page.locator('meta[name=robots]')).toHaveAttribute('content', 'noindex, nofollow')
		await expect(page.getByText('synthetic@example.test', { exact: true })).toBeVisible()
		expect(await page.content()).not.toContain('fixture-user')
		expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(390)
		const response = await page.goto('/es/settings/privacy')
		expect(response?.headers()['cache-control']).toBe('private, no-store')
		await expect(page.locator('main a[href="/es/support"]')).toBeVisible()
		await expect(page.locator('main a[href="/es/leaderboard"]')).toBeVisible()
		expect(await response?.text()).not.toContain('synthetic@example.test')
	})

	test('denied clipboard selects the account ID; cancel sends no erasure and a refused write keeps the session', async ({
		page,
		context,
		baseURL,
	}) => {
		await context.addCookies([memberCookie(baseURL!)])
		await page.addInitScript(() =>
			Object.defineProperty(navigator, 'clipboard', {
				value: { writeText: () => Promise.reject(new Error('fixture refusal')) },
			}),
		)
		const writes: unknown[] = []
		await page.route(erasure, async (route) => {
			writes.push(route.request().postDataJSON())
			await route.fulfill({
				status: 412,
				json: { code: 'failed_precondition', message: 'cancel_subscription_first' },
			})
		})
		await page.goto('/settings/account')
		await expect(page.getByTestId('account-id')).toHaveText('fixture-user')
		await page.getByRole('button', { name: 'Copy ID' }).click()
		await expect(page.getByRole('alert')).toContainText('Could not copy')
		expect(await page.evaluate(() => String(window.getSelection()))).toBe('fixture-user')
		const dialog = await showDeletion(page)
		await page.keyboard.press('Escape')
		await expect(dialog).not.toBeVisible()
		await expect(page.getByRole('button', { name: 'Delete my data' })).toBeFocused()
		expect(writes).toEqual([])
		await (await showDeletion(page)).getByRole('button', { name: 'Delete everything' }).click()
		await expect(page.getByText('Your data was not deleted.', { exact: false })).toBeVisible()
		expect(writes).toEqual([{ confirm: 'DELETE' }])
		expect((await fixture()).some(({ path }) => path === '/v1/client/sign-out')).toBe(false)
		await expect(page).toHaveURL('/settings/account')
	})

	test('confirmed, accepted erasure signs out, clears the cookie and leaves private settings', async ({
		page,
		context,
		baseURL,
	}) => {
		await context.addCookies([memberCookie(baseURL!)])
		await page.route(erasure, async (route) => {
			expect(route.request().postDataJSON()).toEqual({ confirm: 'DELETE' })
			await route.fulfill({ status: 200, json: { rowsDeleted: '4' } })
		})
		await page.goto('/settings/account')
		await (await showDeletion(page)).getByRole('button', { name: 'Delete everything' }).click()
		await expect(page).toHaveURL('/')
		expect((await context.cookies()).some(({ name }) => name === 'puzzled_session')).toBe(false)
		expect((await fixture()).filter(({ path }) => path === '/v1/client/sign-out')).toHaveLength(1)
	})

	test('device reads paginate, a revoke updates only the target, and unreadable sessions are not empty', async ({
		page,
		context,
		baseURL,
	}) => {
		await context.addCookies([memberCookie(baseURL!)])
		await page.goto('/settings/security')
		await expect(page.getByText('This device', { exact: true })).toBeVisible()
		await page.getByRole('button', { name: 'Next page' }).click()
		await expect(page.getByText('Old phone', { exact: true })).toBeVisible()
		await page.getByRole('button', { name: 'First page' }).click()
		const tablet = page.getByRole('listitem').filter({ hasText: 'Fixture tablet' })
		await tablet.getByRole('button', { name: 'Sign out', exact: true }).click()
		await expect(tablet.getByRole('button', { name: 'Sign out', exact: true })).toHaveCount(0)
		await expect(
			page
				.getByRole('listitem')
				.filter({ hasText: 'This device' })
				.getByRole('button', { name: 'Sign out', exact: true }),
		).toBeVisible()
		expect(
			(await fixture())
				.filter(({ path }) => path.endsWith('/revoke'))
				.map(({ body }) => body?.session_id),
		).toEqual(['tablet'])
		await fixture('sessions-unavailable')
		await page.getByRole('button', { name: 'Try again' }).click()
		await expect(page.getByText('Sessions did not load', { exact: true })).toBeVisible()
		await expect(page.getByText('No active sessions found')).toHaveCount(0)
	})
})
