import { expect, test } from '@playwright/test'
import { productDayKey } from '../src/lib/product-day'

test('copying a challenge without clipboard permission offers a selectable caption', async ({
	page,
}) => {
	await page.route('**/v1/guest/session', (route) => route.fulfill({ json: { issued: true } }))
	await page.route('**/puzzled.v1.PuzzleService/GetDaily', (route) =>
		route.fulfill({
			json: {
				gameSlug: 'sudoku',
				puzzleDate: productDayKey(),
				hasCompleted: true,
				canPlay: false,
				completedSession: { status: 'won', attempts: 1, score: 900, timeSpentMs: '34567' },
			},
		}),
	)
	await page.route('**/puzzled.v1.PuzzleService/ShareResult', (route) =>
		route.fulfill({ json: {} }),
	)
	await page.route('**/puzzled.v1.StatsService/GetTodayPercentile', (route) =>
		route.fulfill({ json: { dispatch: 'insufficient_cohort' } }),
	)
	await page.route('**/puzzled.v1.FunnelService/RecordEvent', (route) =>
		route.fulfill({ json: {} }),
	)
	await page.goto('/games/sudoku?difficulty=easy&start=1#play')
	await page.getByRole('button', { name: 'See your result' }).click()
	const dialog = page.getByRole('dialog', { name: 'Sudoku Complete' })
	const status = dialog.getByRole('status')
	await expect(status).toHaveCount(1)
	await expect(status).toBeEmpty()
	const statusBeforeCopy = await status.elementHandle()
	const cdp = await page.context().newCDPSession(page)
	const { targetInfo } = await cdp.send('Target.getTargetInfo')
	await cdp.send('Browser.setPermission', {
		permission: { name: 'clipboard-write' },
		setting: 'denied',
		origin: new URL(page.url()).origin,
		browserContextId: targetInfo.browserContextId,
	})
	const tap = page.waitForRequest(
		(request) =>
			request.url().endsWith('/puzzled.v1.FunnelService/RecordEvent') &&
			request.postDataJSON().event === 'share_clicked',
	)
	await dialog.getByRole('button', { name: 'Copy challenge', exact: true }).click()
	expect((await tap).postDataJSON()).toEqual({
		event: 'share_clicked',
		gameSlug: 'sudoku',
		action: 'copy_challenge',
		hasPercentile: false,
	})
	await expect(status).toHaveText('Could not share automatically.')
	expect(await status.evaluate((node, before) => node === before, statusBeforeCopy)).toBe(true)
	await expect(dialog.getByText('Challenge copied')).toHaveCount(0)
	const caption = dialog.getByRole('textbox', { name: 'Result caption' })
	const value = await caption.inputValue()
	expect(value).toContain('/games/sudoku')
	await caption.focus()
	expect(
		await caption.evaluate((el: HTMLTextAreaElement) => el.selectionEnd - el.selectionStart),
	).toBe(value.length)
})

for (const historical of [false, true]) {
	test(`the ${historical ? 'past-day' : 'today'} share fallback from a result opens the right game`, async ({
		page,
		browser,
	}) => {
		const now = new Date()
		const today = productDayKey(now)
		const day = historical ? productDayKey(new Date(+now - 86_400_000)) : today
		const service = '**/puzzled.v1.PuzzleService/'
		await page.route('**/v1/guest/session', (route) => route.fulfill({ json: { issued: true } }))
		await page.route(`${service}GetDaily`, (route) =>
			route.fulfill({
				json: {
					gameSlug: 'sudoku',
					puzzleDate: day,
					hasCompleted: true,
					canPlay: false,
					completedSession: { status: 'won', attempts: 1, difficulty: 'medium' },
				},
			}),
		)
		// No challenge ID is available; capture the fallback link from the native share sheet.
		await page.route(`${service}ShareResult`, (route) => route.abort())
		await page.addInitScript(() => {
			Object.defineProperty(navigator, 'clipboard', {
				value: {
					writeText: async () => {
						throw new DOMException('Denied', 'NotAllowedError')
					},
				},
			})
			Object.defineProperty(navigator, 'share', {
				value: async ({ text }: ShareData) => Reflect.set(window, 'sharedCaption', text),
			})
		})
		// A skewed client clock must not turn a server-current result into an archive link.
		await page.clock.setFixedTime(new Date(+now + 86_400_000))
		await page.goto(
			`/games/sudoku?difficulty=medium&start=1${historical ? `&mode=archive&date=${day}` : ''}#play`,
		)
		await page.getByRole('button', { name: 'Copy challenge', exact: true }).click()
		const caption = () =>
			page.evaluate(() => Reflect.get(window, 'sharedCaption') as string | undefined)
		const gameLink = /https?:\/\/[^\s]+\/games\/sudoku\?[^\s]+/
		await expect.poll(caption).toMatch(gameLink)
		const link = new URL((await caption())!.match(gameLink)![0])
		expect(link.pathname).toBe('/games/sudoku')
		expect([...link.searchParams]).toEqual(
			historical
				? [
						['mode', 'archive'],
						['date', day],
						['utm_source', 'share'],
					]
				: [['utm_source', 'share']],
		)

		const recipient = await browser.newContext()
		try {
			const friend = await recipient.newPage()
			const dailyRequests: unknown[] = []
			const daily = { gameSlug: 'sudoku', puzzleDate: today, canPlay: true }
			await friend.route('**/v1/guest/session', (route) =>
				route.fulfill({ json: { issued: true } }),
			)
			await friend.route(`${service}GetDaily`, (route) => {
				const input = route.request().postDataJSON()
				dailyRequests.push(input)
				return input.puzzleDate
					? route.fulfill({
							status: 403,
							json: { code: 'permission_denied', message: 'plus_required_archive' },
						})
					: route.fulfill({ json: { ...daily, requiresStart: true } })
			})
			await friend.route(`${service}StartDaily`, (route) => {
				expect(route.request().postDataJSON()).toMatchObject({
					gameSlug: 'sudoku',
					puzzleDate: today,
					difficulty: 'medium',
				})
				return route.fulfill({
					json: {
						daily: {
							...daily,
							puzzleDataJson: JSON.stringify({
								difficulty: 'medium',
								grid: Array.from({ length: 9 }, () => Array(9).fill(null)),
							}),
						},
					},
				})
			})
			await friend.goto(link.href)
			if (historical) {
				await expect(friend.locator('[data-unlock-panel="archive"]')).toBeVisible()
				expect(dailyRequests).toContainEqual(
					expect.objectContaining({ gameSlug: 'sudoku', puzzleDate: day }),
				)
			} else {
				await friend
					.getByRole('group', { name: "Play today's puzzle", exact: true })
					.getByRole('link', { name: 'Medium', exact: true })
					.click()
				await expect(friend.getByRole('group', { name: 'Sudoku', exact: true })).toBeVisible()
				await expect(friend.locator('[data-unlock-panel]')).toHaveCount(0)
				expect(dailyRequests.length).toBeGreaterThan(0)
				for (const request of dailyRequests) expect(request).not.toHaveProperty('puzzleDate')
			}
		} finally {
			await recipient.close()
		}
	})
}
