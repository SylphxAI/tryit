import { expect, test } from '@playwright/test'
import { fixtureToken } from '../scripts/auth-fixture-facts'

test.describe('Solid stats', () => {
	test.skip(
		process.env.SOLID_CONSOLE_FIXTURE !== '1',
		'requires local Auth and console Connect fixtures',
	)

	test('a new guest gets an honest empty record, guest play and localized account entry', async ({
		page,
	}) => {
		const response = await page.goto('/stats')
		expect(response?.status()).toBe(200)
		expect(response?.headers()['cache-control']).toBe('private, no-store')
		await expect(page.locator('meta[name=robots]')).toHaveAttribute('content', 'noindex, nofollow')
		await expect(page.getByRole('heading', { name: 'Statistics' })).toBeVisible()
		await expect(page.getByText('No stats yet', { exact: true })).toBeVisible()
		await expect(page.getByRole('link', { name: 'Sign in to keep your record' })).toHaveAttribute(
			'href',
			'/sign-in?callbackUrl=%2Fstats',
		)
		await expect(page.getByRole('link', { name: 'See Tryit Plus' })).toHaveAttribute(
			'href',
			'/pricing?utm_source=tryit&utm_medium=stats_banner&entry_surface=stats_banner',
		)
		await expect(page.getByText('Tryit Plus · $35 a year', { exact: true })).toBeVisible()
		await page.goto('/es/stats')
		await expect(page.locator('main a[href*="sign-in"]')).toHaveAttribute(
			'href',
			'/es/sign-in?callbackUrl=%2Fes%2Fstats',
		)
	})

	test('keeps the guest’s accepted results, progress markers, and keyboard calendar disclosure', async ({
		page,
		context,
		baseURL,
	}) => {
		await context.addCookies([
			{
				domain: new URL(baseURL!).hostname,
				path: '/',
				name: '__Host-puzzled_guest',
				value: 'console-guest',
				secure: true,
			},
		])
		const response = await page.goto('/stats')
		expect(await response?.text()).not.toContain('internal-id-not-for-browser')
		await expect(page.getByText('Guest play', { exact: true })).toBeVisible()
		const modules = page.getByRole('table', {
			name: 'Finished puzzles with wins, win rate and best score',
		})
		await expect(modules.getByRole('row', { name: 'Sudoku 3 2 67% 42' })).toBeVisible()
		const history = page.getByRole('table', {
			name: 'Recent finished sessions with puzzle, result, score and time',
		})
		await expect(history.getByRole('row', { name: /Sudoku Won 42/ })).toBeVisible()
		await expect(page.getByRole('link', { name: 'Sudoku Finished', exact: true })).toHaveAttribute(
			'href',
			'/games/sudoku',
		)
		const calendar = page.getByRole('table', {
			name: 'Days with a finished daily puzzle in the last 8 weeks',
		})
		await expect(calendar).not.toBeVisible()
		const disclosure = page.getByText('Show every finished day', { exact: true })
		await disclosure.focus()
		await disclosure.press('Enter')
		await expect(calendar.getByRole('row')).toHaveCount(2)
		await expect(calendar.getByRole('cell', { name: '1' })).toHaveCount(2)
	})

	test('partial member failure preserves readable stats without an activity calendar or Plus upsell', async ({
		page,
		context,
		baseURL,
	}) => {
		await context.addCookies([
			{ url: baseURL, name: 'puzzled_session', value: fixtureToken },
			{
				domain: new URL(baseURL!).hostname,
				path: '/',
				name: '__Host-puzzled_guest',
				value: 'history-unavailable',
				secure: true,
			},
		])
		await page.goto('/stats')
		await expect(
			page.getByText(
				'Signed in as synthetic@example.test. Everything here comes from puzzles you finished.',
			),
		).toBeVisible()
		await expect(page.getByRole('row', { name: 'Sudoku 8 6 75% 42' })).toBeVisible()
		await expect(page.getByText('Activity did not load', { exact: true })).toBeVisible()
		await expect(page.getByText('Show every finished day', { exact: true })).toHaveCount(0)
		await expect(page.getByText('See Tryit Plus', { exact: true })).toHaveCount(0)
	})

	test('an unrecognized account session is unavailable, not a new guest or a public offer', async ({
		request,
	}) => {
		const response = await request.get('/stats', {
			headers: { cookie: 'puzzled_session=unknown-fixture-session' },
		})
		const html = await response.text()
		expect(response.status()).toBe(200)
		expect(response.headers()['cache-control']).toBe('private, no-store')
		expect(html).toContain('Your stats did not load')
		expect(html).not.toContain('No stats yet')
		expect(html).not.toContain('See Tryit Plus')
		expect(html).not.toContain('synthetic@example.test')
	})
})
