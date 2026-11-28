import { readdir, readFile } from 'node:fs/promises'
import { devices, expect, type Page, test } from '@playwright/test'
import { productDayKey } from '../src/lib/product-day'
import { SAVE_STREAK_DISMISSED_DAY_KEY } from '../src/lib/storage-keys'

const slug = 'word-guess'
const next = 'crowns'
const path = '/en-US/games/word-guess?start=1#play'
const guesses = ['crane', 'raise', 'blush', 'flame', 'sugar', 'lemon']
const loss = { status: 'lost', attempts: guesses.length }
const { defaultBrowserType: _browser, ...phone } = devices['iPhone 13']

async function stubFiveLoss(
	page: Page,
	baseURL: string | undefined,
	beforeAccept?: () => Promise<void>,
	retentionEvents?: unknown[],
) {
	expect(['localhost', '127.0.0.1']).toContain(new URL(baseURL ?? '').hostname)
	const dayKey = productDayKey()
	const puzzle = { gameSlug: slug, puzzleDate: dayKey }
	let accepted = false
	await page.emulateMedia({ reducedMotion: 'reduce' })
	await page.setExtraHTTPHeaders({ 'CF-IPCountry': 'DE' })
	await page.addInitScript(
		(priorDay) => {
			if (!localStorage.getItem(priorDay.key)) localStorage.setItem(priorDay.key, priorDay.value)
		},
		{
			key: SAVE_STREAK_DISMISSED_DAY_KEY,
			value: productDayKey(new Date(Date.now() - 86_400_000)),
		},
	)
	await page.route('**/v1/guest/session', (route) => route.fulfill({ json: { issued: true } }))
	await page.route('**/puzzled.v1.PuzzleService/GetDaily', (route) =>
		route.fulfill({
			json: accepted
				? { ...puzzle, canPlay: false, completedSession: loss }
				: {
						...puzzle,
						canPlay: true,
						puzzleDataJson: JSON.stringify({ wordLength: 5, maxAttempts: guesses.length }),
					},
		}),
	)
	await page.route('**/puzzled.v1.PuzzleService/GetTodayProgress', (route) =>
		route.fulfill({
			json: {
				dayKey,
				freePicks: { gameSlugs: [slug] },
				games: [
					{ gameSlug: slug, hasCompleted: accepted },
					{ gameSlug: next, hasCompleted: false },
				],
			},
		}),
	)
	await page.route('**/puzzled.v1.PuzzleService/CheckGuess', (route) =>
		route.fulfill({ json: { resultJson: JSON.stringify({ tiles: Array(5).fill('absent') }) } }),
	)
	await page.route('**/puzzled.v1.PuzzleService/SubmitGuess', async (route) => {
		const input = route.request().postDataJSON()
		expect(input).toMatchObject({ ...puzzle, ...loss })
		expect(JSON.parse(input.submissionJson)).toEqual({ guesses })
		if (beforeAccept) await beforeAccept()
		accepted = true
		return route.fulfill({ json: { gameSlug: slug, valid: true, status: 'lost' } })
	})
	await page.route('**/puzzled.v1.GamificationService/GetStreakInfo', (route) =>
		route.fulfill({ json: { info: { currentStreak: accepted ? 1 : 0 } } }),
	)
	await page.route('**/puzzled.v1.FunnelService/RecordEvent', (route) => {
		if (retentionEvents) {
			const body = route.request().postDataJSON()
			if (body.event.startsWith('save_streak_')) retentionEvents.push(body)
		}
		return route.fulfill({ json: {} })
	})
	await page.route('**/puzzled.v1.PuzzleService/ShareResult', (route) =>
		route.fulfill({ json: {} }),
	)
	return dayKey
}

async function playFiveLoss(page: Page, mobile: boolean) {
	const board = page.getByRole('table', { name: 'Five', exact: true })
	await expect(board).toBeVisible()
	// Give Chromium an install event even on loopback, so absence on loss is meaningful.
	await page.evaluate(() =>
		window.dispatchEvent(new Event('beforeinstallprompt', { cancelable: true })),
	)
	const keyboard = page
		.locator('fieldset')
		.filter({ has: page.getByRole('button', { name: 'Enter', exact: true }) })
	for (const [i, word] of guesses.entries()) {
		if (mobile) {
			for (const key of word.toUpperCase())
				await keyboard.getByRole('button', { name: key, exact: true }).tap()
			await keyboard.getByRole('button', { name: 'Enter', exact: true }).tap()
		} else {
			await page.keyboard.type(word)
			await page.keyboard.press('Enter')
		}
		await expect(board.getByRole('row').nth(i).locator('[data-grade="absent"]')).toHaveCount(5)
	}
}

for (const mobile of [true, false]) {
	test.describe(mobile ? 'iPhone 13 (390×844)' : 'desktop (1440×900)', () => {
		test.use(
			mobile
				? { ...phone, viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true }
				: { viewport: { width: 1440, height: 900 } },
		)

		test('Five daily loss offers a reachable, dismissible save-streak card', async ({
			page,
			baseURL,
		}, info) => {
			const retentionEvents: unknown[] = []
			const dayKey = await stubFiveLoss(page, baseURL, undefined, retentionEvents)
			await page.goto(path)
			await playFiveLoss(page, mobile)

			const card = page.locator('[data-board-finished]')
			await expect(card.locator('[data-outcome="lost"]')).toBeVisible()
			const offer = card.locator('[data-result-guest-capture]')
			const dismiss = offer.getByRole('button', { name: 'Dismiss', exact: true })
			await expect(offer).toBeVisible()
			await expect(offer.getByRole('paragraph')).toHaveText(
				'Create a free account to keep your streak of 1 day and today’s result. Takes about 20 seconds.',
			)
			await expect(card.locator('[data-install-nudge], [data-result-milestone]')).toHaveCount(0)
			const actions = card.getByRole('button').or(card.getByRole('link'))
			for (const action of [
				card.getByRole('link', { name: /^Play next:/ }),
				card.getByRole('button', { name: 'Copy challenge', exact: true }),
				card.getByRole('link', { name: 'Practice another', exact: true }),
				card.getByRole('button', { name: 'See your result', exact: true }),
				offer.getByRole('link', { name: 'Create a free account', exact: true }),
				dismiss,
			])
				await expect(action).toBeVisible()
			await expect(actions).toHaveCount(6)
			await page.evaluate(() => document.fonts.ready)
			const png = info.outputPath('five-loss.png')
			await page.screenshot({ path: png })
			await info.attach('Five loss', { path: png, contentType: 'image/png' })
			const { scrollHeight, clientHeight } = await card.evaluate((el) => ({
				scrollHeight: el.scrollHeight,
				clientHeight: el.clientHeight,
			}))
			await expect(card).toBeInViewport({ ratio: 0.99 })
			expect.soft(scrollHeight, 'finish card does not scroll').toBeLessThanOrEqual(clientHeight + 1)
			for (const action of await actions.all()) {
				const hit = await action.evaluate((el) => {
					const { left, top, width, height } = el.getBoundingClientRect()
					return el.contains(document.elementFromPoint(left + width / 2, top + height / 2))
				})
				expect
					.soft(
						hit,
						(await action.getAttribute('aria-label')) ?? (await action.textContent()) ?? '',
					)
					.toBe(true)
			}

			const account = offer.getByRole('link', { name: 'Create a free account', exact: true })
			for (const control of [account, dismiss]) {
				const { width, height } = await control.evaluate((el) =>
					el.getBoundingClientRect().toJSON(),
				)
				expect(width).toBeGreaterThanOrEqual(44)
				expect(height).toBeGreaterThanOrEqual(44)
			}
			await expect
				.poll(() => retentionEvents.slice())
				.toEqual([{ event: 'save_streak_prompted', status: 'lost', trigger: 'daily_finish' }])
			// Keep this fixture on the finish card after exercising the real CTA handler.
			await account.evaluate((link) =>
				link.addEventListener('click', (event) => event.preventDefault(), { once: true }),
			)
			await account.click()
			await expect
				.poll(() => retentionEvents.slice())
				.toEqual([
					{ event: 'save_streak_prompted', status: 'lost', trigger: 'daily_finish' },
					{ event: 'save_streak_clicked', status: 'lost', trigger: 'daily_finish' },
				])
			await account.focus()
			await page.keyboard.press('Tab')
			await expect(dismiss).toBeFocused()
			if (mobile) await dismiss.tap()
			else await page.keyboard.press('Enter')
			await expect(offer).toHaveCount(0)
			expect(
				await page.evaluate((key) => localStorage.getItem(key), SAVE_STREAK_DISMISSED_DAY_KEY),
			).toBe(dayKey)
			const refetchedStreak = page.waitForResponse(
				(response) => response.ok() && response.url().endsWith('/GetStreakInfo'),
			)
			await page.reload()
			const replay = page.locator('[data-game-stage="completed"]')
			await expect(replay).toBeVisible()
			await refetchedStreak
			await expect(replay.locator('[data-result-guest-capture]')).toHaveCount(0)
		})
	})
}

// Other Solid server functions share this URL. Match only the generated
// reader so unrelated document and server-function requests stay healthy.
async function guestStatusReference(): Promise<string> {
	const dir = '.output/server/_ssr'
	const refs = new Set<string>()
	// A shared server reader can move out of the entry chunk when imported twice.
	for (const file of await readdir(dir)) {
		if (!file.endsWith('.mjs')) continue
		const source = await readFile(`${dir}/${file}`, 'utf8')
		for (const match of source.matchAll(
			/createServerReference\("([^"]+)", async function readPlayGuestStatus\(/g,
		))
			refs.add(match[1])
	}
	expect(refs.size).toBe(1)
	return [...refs][0]
}

for (const scenario of ['recover', 'fail-closed', 'signed-in', 'exit'] as const) {
	test(`Five loss guest-status read: ${scenario}`, async ({ page, context, baseURL }, info) => {
		const identity = await guestStatusReference()
		const requests: number[] = []
		const allowRetry = Promise.withResolvers<void>()
		const submitStarted = Promise.withResolvers<void>()
		const allowAccept = Promise.withResolvers<void>()
		await stubFiveLoss(
			page,
			baseURL,
			scenario === 'exit'
				? async () => {
						submitStarted.resolve()
						await allowAccept.promise
					}
				: undefined,
		)
		if (scenario === 'signed-in') {
			await context.addCookies([
				{
					name: 'puzzled_session',
					value: 'local-account-fixture',
					url: new URL(baseURL ?? '').origin,
					httpOnly: true,
				},
			])
		}
		await page.route('**/_server', async (route) => {
			if (route.request().headers()['x-server-id'] !== identity) return route.continue()
			const index = requests.length
			requests.push(0)
			if (index === 1) await allowRetry.promise
			if (
				scenario !== 'signed-in' &&
				(index === 0 || (index === 1 && scenario === 'fail-closed'))
			) {
				await route.fulfill({ status: 503, body: 'fixture identity service unavailable' })
				requests[index] = 503
				return
			}
			const response = await route.fetch()
			await route.fulfill({ response })
			requests[index] = response.status()
		})
		try {
			await page.goto(path)
			await expect.poll(() => requests[0]).toBe(scenario === 'signed-in' ? 200 : 503)
			await playFiveLoss(page, false)
			const finish = page.locator('[data-board-finished]')
			const save = page.locator('[data-result-guest-capture]')
			if (scenario === 'exit') {
				await submitStarted.promise
				await expect(finish).toHaveCount(0)
				await page.goto('/en-US/privacy')
				allowAccept.resolve()
				await expect(finish).toHaveCount(0)
				await expect(save).toHaveCount(0)
				expect(requests).toEqual([503])
				return
			}
			await expect(finish.locator('[data-outcome="lost"]')).toBeVisible()
			// The result/actions are not gated by the held identity response.
			await expect(finish.getByRole('link', { name: /^Play next:/ })).toBeVisible()
			await expect(finish.getByRole('button', { name: 'Copy challenge' })).toBeVisible()
			await expect(finish.getByRole('button', { name: 'See your result' })).toBeVisible()
			await expect(save).toHaveCount(0)
			await page.evaluate(() =>
				document.documentElement.setAttribute('data-fixture-same-document', '1'),
			)
			allowRetry.resolve()
			if (scenario === 'recover') {
				await expect(save).toHaveCount(1)
				await expect(save.getByRole('paragraph')).toContainText('keep your streak of 1 day')
			} else if (scenario === 'fail-closed') {
				await expect.poll(() => requests[1]).toBe(503)
				await expect(save).toHaveCount(0)
			}
			await expect(page.locator('html')).toHaveAttribute('data-fixture-same-document', '1')
			await expect(page.locator('[data-install-nudge]')).toHaveCount(0)
			await page.screenshot({ path: info.outputPath(`${scenario}.png`) })
			expect(requests).toEqual(
				scenario === 'signed-in' ? [200] : scenario === 'recover' ? [503, 200] : [503, 503],
			)
			if (scenario === 'fail-closed') {
				await page.reload()
				await expect(page.locator('[data-game-stage="completed"]')).toBeVisible()
				await expect(save).toHaveCount(1)
				expect(requests).toEqual([503, 503, 200])
			}
		} finally {
			allowRetry.resolve()
			allowAccept.resolve()
		}
	})
}
