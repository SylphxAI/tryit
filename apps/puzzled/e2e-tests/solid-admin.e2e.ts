import { expect, test } from '@playwright/test'

const fixture = process.env.ADMIN_FIXTURE_URL ?? 'http://127.0.0.1:18897'
const admin = 'puzzled_session=fixture-operator-session'
const member = 'puzzled_session=fixture-session'

const paths = [
	'/',
	'/analytics',
	'/announcements',
	'/audit-logs',
	'/dlq',
	'/experiments',
	'/games',
	'/games/sudoku',
	'/settings',
	'/system',
]

async function trace() {
	const response = await fetch(`${fixture}/__fixture`)
	return (await response.json()) as Array<{ method: string; input: Record<string, unknown> }>
}

test.describe('Solid admin console (built Nitro)', () => {
	test.skip(process.env.SOLID_ADMIN_FIXTURE !== '1', 'requires the local admin fixtures')
	test.beforeEach(async () => {
		expect((await fetch(`${fixture}/__fixture`, { method: 'DELETE' })).ok).toBe(true)
	})

	test('all admin routes require product admin; SSR data is private and not indexed', async ({
		request,
	}) => {
		const guest = await request.get('/es/admin/audit-logs?action=update', { maxRedirects: 0 })
		expect(guest.status()).toBe(302)
		expect(guest.headers().location).toBe(
			'/es/sign-in?callbackUrl=%2Fes%2Fadmin%2Faudit-logs%3Faction%3Dupdate',
		)
		const analyticsGuest = await request.get('/es/admin/analytics', { maxRedirects: 0 })
		expect(analyticsGuest.status()).toBe(302)
		expect(analyticsGuest.headers().location).toBe(
			'/es/sign-in?callbackUrl=%2Fes%2Fadmin%2Fanalytics',
		)
		expect(analyticsGuest.headers()['cache-control']).toBe('private, no-store')
		expect(analyticsGuest.headers()['x-robots-tag']).toBe('noindex, nofollow')
		for (const path of paths) {
			const url = `/admin${path === '/' ? '' : path}`
			const operator = await request.get(url, { headers: { cookie: admin } })
			expect(operator.status(), url).toBe(200)
			expect(operator.headers()['cache-control']).toBe('private, no-store')
			expect(operator.headers()['x-robots-tag']).toBe('noindex, nofollow')
			expect(await operator.text()).not.toContain('fixture-settings-marker')
			const unprivileged = await request.get(url, { headers: { cookie: member } })
			expect(unprivileged.status(), url).toBe(403)
			expect(unprivileged.headers()['cache-control']).toBe('private, no-store')
			expect(unprivileged.headers()['x-robots-tag']).toBe('noindex, nofollow')
			const html = await unprivileged.text()
			expect(html).toContain('Admin Access Required')
			expect(html).not.toMatch(
				/fixture-resource|fixture-failed-job|fixture uptime|First-finish retention/,
			)
		}
		expect(
			(await request.get('/admin/games/not-a-game', { headers: { cookie: admin } })).status(),
		).toBe(404)
	})

	test('Analytics distinguishes missing, empty, provisional and stale cohorts at desktop and phone widths', async ({
		page,
		context,
		baseURL,
	}, testInfo) => {
		await context.addCookies([
			{ url: baseURL!, name: 'puzzled_session', value: 'fixture-operator-session' },
		])
		for (const width of [1280, 390]) {
			await page.setViewportSize({ width, height: 844 })
			const response = await page.goto('/admin/analytics')
			expect(response?.status()).toBe(200)
			expect(response?.headers()['cache-control']).toBe('private, no-store')
			expect(response?.headers()['x-robots-tag']).toBe('noindex, nofollow')
			const table = page.getByRole('region', {
				name: 'Retention and guest completion by product day',
			})
			const provisional = table.getByRole('row', { name: /2026-11-21/ })
			await expect(provisional).toContainText('Provisional · Stale')
			await expect(provisional.getByRole('cell')).toHaveText([
				'20% (4 / 20)',
				'0% (0 / 8)',
				'40% (4 / 10)',
			])
			await expect(table.getByRole('row', { name: /2026-11-20/ })).toContainText('Stale')
			await expect(table.getByRole('row', { name: /2026-11-20/ }).getByRole('cell')).toHaveText(
				Array(3).fill('No cohort (0 / 0)'),
			)
			await expect(table.getByRole('row', { name: /2026-11-19/ }).getByRole('cell')).toHaveText(
				Array(3).fill('Unavailable'),
			)
			expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(
				width,
			)
			await page.screenshot({ path: testInfo.outputPath(`analytics-${width}.png`), fullPage: true })
		}
		expect((await trace()).map(({ method }) => method)).toEqual([
			'GetSettings',
			'GetMetricsReport',
			'GetSettings',
			'GetMetricsReport',
		])
	})

	test('keyboard navigation, filters, detail dialog and a narrow table remain usable', async ({
		page,
		context,
		baseURL,
	}) => {
		await context.addCookies([
			{ url: baseURL!, name: 'puzzled_session', value: 'fixture-operator-session' },
		])
		await page.setViewportSize({ width: 390, height: 844 })
		await page.goto('/admin')
		await page.keyboard.press('Control+k')
		const palette = page.getByRole('dialog')
		await expect(palette).toBeVisible()
		await palette.getByRole('textbox').fill('audit')
		await palette.getByRole('link', { name: 'Audit Logs' }).click()
		await expect(page.getByRole('heading', { name: 'Audit Logs' })).toBeVisible()
		await expect(page.getByRole('link', { name: 'Next' })).toBeVisible()
		await page.getByLabel('Action Type').selectOption('update')
		await page.getByRole('button', { name: 'Apply filter' }).click()
		await expect(page).toHaveURL(/action=update/)
		await expect(page.getByRole('link', { name: 'Next' })).toHaveCount(0)
		await page.getByRole('button', { name: 'Audit Log Details' }).click()
		await expect(page.getByRole('dialog')).toContainText('audit marker')
		await page.keyboard.press('Escape')
		await expect(page.getByRole('dialog')).toHaveCount(0)
		expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390)
	})

	test('announcements and queue commands require confirmation and refresh from the API', async ({
		page,
		context,
		baseURL,
	}) => {
		await context.addCookies([
			{ url: baseURL!, name: 'puzzled_session', value: 'fixture-operator-session' },
		])
		await page.goto('/admin/announcements')
		await page.getByRole('button', { name: /create/i }).click()
		const dialog = page.getByRole('dialog')
		await dialog.locator('[name=title]').fill('Fixture maintenance notice')
		await dialog.locator('[name=body]').fill('Announcement fixture body')
		await dialog.locator('[name=startsAt]').fill('2026-11-21T12:00')
		await dialog.locator('[name=endsAt]').fill('2026-11-20T12:00')
		await dialog.getByRole('button', { name: /save/i }).click()
		await expect(dialog.getByRole('alert')).toContainText('Check the supplied values')
		expect((await trace()).some(({ method }) => method === 'CreateAnnouncement')).toBe(false)
		await dialog.locator('[name=endsAt]').fill('2026-11-22T12:00')
		await dialog.getByRole('button', { name: /save/i }).click()
		await expect(page.getByRole('heading', { name: 'Fixture maintenance notice' })).toBeVisible()
		await page.getByRole('button', { name: /edit announcement/i }).click()
		await dialog.locator('[name=endsAt]').fill('')
		await dialog.getByRole('button', { name: /save/i }).click()
		await expect
			.poll(
				async () =>
					(await trace()).find(({ method }) => method === 'UpdateAnnouncement')?.input.endsAt,
			)
			.toBe('')
		await page.getByRole('button', { name: 'Delete', exact: true }).click()
		await dialog.getByRole('button', { name: 'Cancel' }).click()
		expect((await trace()).some(({ method }) => method === 'DeleteAnnouncement')).toBe(false)
		await page.getByRole('button', { name: 'Delete', exact: true }).click()
		await dialog.getByRole('button', { name: 'Delete', exact: true }).click()
		await expect(page.getByRole('heading', { name: 'Fixture maintenance notice' })).toHaveCount(0)
		await page.goto('/admin/dlq')
		await page.getByRole('button', { name: 'Retry', exact: true }).click()
		await dialog.getByRole('button', { name: 'Retry', exact: true }).click()
		await expect(page.getByRole('cell', { name: 'Retrying', exact: true })).toBeVisible()
		await page.getByRole('button', { name: 'Mark Resolved' }).click()
		await dialog.getByRole('button', { name: 'Mark Resolved' }).click()
		await expect(page.getByRole('cell', { name: 'Resolved', exact: true })).toBeVisible()
	})
})
