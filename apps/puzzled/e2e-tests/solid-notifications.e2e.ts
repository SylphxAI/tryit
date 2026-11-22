import { expect, type Page, test } from '@playwright/test'
import { fixtureToken } from '../scripts/auth-fixture-facts'

async function browserPush(page: Page, permission: 'granted' | 'denied', subscribed = false) {
	await page.addInitScript(
		({ permission, subscribed }) => {
			let active = subscribed
			const subscription = {
				endpoint: 'https://push.example.test/one-device',
				toJSON: () => ({ keys: { p256dh: 'fixture-key', auth: 'fixture-auth' } }),
				unsubscribe: async () => {
					active = false
					return true
				},
			}
			// Keep the real registration and /sw.js install; stub only the external push service.
			Object.defineProperty(Notification, 'requestPermission', { value: async () => permission })
			Object.defineProperty(PushManager.prototype, 'getSubscription', {
				value: async () => (active ? subscription : null),
			})
			Object.defineProperty(PushManager.prototype, 'subscribe', {
				value: async () => {
					active = true
					return subscription
				},
			})
		},
		{ permission, subscribed },
	)
}

const routeFor = (method: string) => `**/puzzled.v1.PreferencesService/${method}`

test.describe('Solid notification settings', () => {
	test.skip(
		process.env.SOLID_CONSOLE_FIXTURE !== '1',
		'requires the local Auth and Connect fixtures',
	)

	test('only members can read settings and an unreadable response has no writable defaults', async ({
		request,
	}) => {
		const guest = await request.get('/es/settings/notifications', { maxRedirects: 0 })
		expect(guest.status()).toBe(302)
		expect(guest.headers().location).toBe(
			'/es/sign-in?callbackUrl=%2Fes%2Fsettings%2Fnotifications',
		)
		expect(guest.headers()['cache-control']).toBe('private, no-store')
		const member = await request.get('/settings/notifications', {
			headers: { cookie: `puzzled_session=${fixtureToken}; __Host-puzzled_guest=unavailable` },
		})
		expect(member.status()).toBe(200)
		expect(member.headers()['cache-control']).toBe('private, no-store')
		expect(await member.text()).toContain('Failed to load notification preferences')
		expect(await member.text()).not.toContain('type="time"')
	})

	test('denied browser permission does not subscribe the device or change reminders', async ({
		page,
		context,
		baseURL,
	}) => {
		await context.addCookies([{ url: baseURL!, name: 'puzzled_session', value: fixtureToken }])
		await browserPush(page, 'denied')
		const calls: string[] = []
		await page.route('**/puzzled.v1.PreferencesService/*', (route) => {
			calls.push(route.request().url())
			return route.abort()
		})
		await page.goto('/settings/notifications')
		await page.getByRole('button', { name: 'Remind me daily' }).press('Enter')
		await expect(page.getByRole('alert')).toContainText('Daily reminders are unavailable')
		await expect(page.getByRole('button', { name: 'Remind me daily' })).toBeEnabled()
		await expect(page.getByRole('button', { name: 'Save Preferences' })).toHaveCount(0)
		expect(calls).toEqual([])
	})

	test('registers this device and saves typed reminders without changing email; removing it is device-only', async ({
		page,
		context,
		baseURL,
	}) => {
		await context.addCookies([{ url: baseURL!, name: 'puzzled_session', value: fixtureToken }])
		await browserPush(page, 'granted')
		await page.setViewportSize({ width: 390, height: 844 })
		const deviceWrites: Record<string, unknown>[] = []
		const preferencesWrites: Record<string, unknown>[] = []
		await page.route(routeFor('GetWebPushConfig'), (route) =>
			route.fulfill({ json: { publicKey: 'AQ' } }),
		)
		await page.route(routeFor('SaveWebPushSubscription'), async (route) => {
			deviceWrites.push(route.request().postDataJSON())
			await route.fulfill({ json: {} })
		})
		await page.route(routeFor('UpdatePushPreferences'), async (route) => {
			preferencesWrites.push(route.request().postDataJSON())
			if (preferencesWrites.length === 2) {
				await route.fulfill({ status: 503, json: { code: 'unavailable' } })
				return
			}
			await route.fulfill({
				json: {
					preferences: {
						pushEnabled: true,
						pushDailyReminder: true,
						dailyReminderTime: preferencesWrites.length === 1 ? '09:30' : '18:10',
					},
				},
			})
		})
		await page.goto('/settings/notifications')
		await page.getByRole('button', { name: 'Remind me daily' }).click()
		const time = page.getByLabel('Reminder time (your local time)')
		const save = page.getByRole('button', { name: 'Save Preferences' })
		await expect(save).toBeEnabled()
		await expect(time).toHaveValue('09:30')
		expect(deviceWrites).toEqual([
			expect.objectContaining({
				endpoint: 'https://push.example.test/one-device',
				locale: 'en-US',
			}),
		])
		expect(preferencesWrites).toEqual([
			{ pushEnabled: true, pushDailyReminder: true, timezone: expect.any(String) },
		])
		await time.fill('18:15')
		await page.getByRole('checkbox', { name: 'Streak Alerts' }).check()
		await save.click()
		await expect(page.getByRole('alert')).toContainText('Daily reminders are unavailable')
		await expect(time).toHaveValue('18:15')
		await save.click()
		await expect(time).toHaveValue('18:10')
		await expect(page.getByRole('checkbox', { name: 'Streak Alerts' })).not.toBeChecked()
		expect(preferencesWrites.slice(1)).toEqual(
			Array.from({ length: 2 }, () => ({
				pushDailyReminder: true,
				pushStreakAlert: true,
				pushNewGames: false,
				dailyReminderTime: '18:15',
				timezone: expect.any(String),
			})),
		)
		expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(390)
		await page.getByRole('button', { name: 'Disable' }).click()
		await expect(page.getByRole('button', { name: 'Remind me daily' })).toBeVisible()
		await expect(save).toHaveCount(0)
		expect(deviceWrites).toHaveLength(2)
		expect(deviceWrites[1]).toMatchObject({ endpoint: deviceWrites[0]?.endpoint, remove: true })
		expect(preferencesWrites).toHaveLength(3)
	})
})
