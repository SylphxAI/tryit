import { devices, expect, test } from '@playwright/test'
import { productDayKey } from '../src/lib/product-day'
import { SAVE_STREAK_DISMISSED_DAY_KEY } from '../src/lib/storage-keys'

const slug = 'word-guess'
const next = 'crowns'
const path = '/en-US/games/word-guess?start=1#play'
const guesses = ['crane', 'raise', 'blush', 'flame', 'sugar', 'lemon']
const loss = { status: 'lost', attempts: guesses.length }
const { defaultBrowserType: _browser, ...phone } = devices['iPhone 13']

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
			expect(['localhost', '127.0.0.1']).toContain(new URL(baseURL ?? '').hostname)
			const dayKey = productDayKey()
			const puzzle = { gameSlug: slug, puzzleDate: dayKey }
			let accepted = false
			await page.emulateMedia({ reducedMotion: 'reduce' })
			await page.setExtraHTTPHeaders({ 'CF-IPCountry': 'DE' })
			await page.addInitScript(
				(priorDay) => {
					if (!localStorage.getItem(priorDay.key))
						localStorage.setItem(priorDay.key, priorDay.value)
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
			await page.route('**/puzzled.v1.PuzzleService/SubmitGuess', (route) => {
				const input = route.request().postDataJSON()
				expect(input).toMatchObject({ ...puzzle, ...loss })
				expect(JSON.parse(input.submissionJson)).toEqual({ guesses })
				accepted = true
				return route.fulfill({ json: { gameSlug: slug, valid: true, status: 'lost' } })
			})
			await page.route('**/puzzled.v1.GamificationService/GetStreakInfo', (route) =>
				route.fulfill({ json: { info: { currentStreak: accepted ? 1 : 0 } } }),
			)
			await page.route('**/puzzled.v1.FunnelService/RecordEvent', (route) =>
				route.fulfill({ json: {} }),
			)
			await page.route('**/puzzled.v1.PuzzleService/ShareResult', (route) =>
				route.fulfill({ json: {} }),
			)

			await page.goto(path)
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

			const card = page.locator('[data-board-finished]')
			await expect(card.locator('[data-outcome="lost"]')).toBeVisible()
			const offer = card.locator('[data-result-guest-capture]')
			const dismiss = offer.getByRole('button', { name: 'Dismiss', exact: true })
			await expect(offer).toBeVisible()
			await expect(offer.getByRole('paragraph')).toHaveText(
				'Create a free account to keep your streak of 1 day and today’s result.',
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

			if (mobile) await dismiss.tap()
			else await dismiss.click()
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
