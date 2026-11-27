import { readFile } from 'node:fs/promises'
import AxeBuilder from '@axe-core/playwright'
import { expect, type Page, test } from '@playwright/test'
import pathGoldens from '../../../crates/puzzled-core/tests/fixtures/generate/number-path.json'
import { fixtureShareId } from '../scripts/share-fixture-facts'
import { freeGameForDayKey } from '../src/lib/free-rotation'
import { gamePath } from '../src/lib/game-slug'
import { productDayKey } from '../src/lib/product-day'
import { WCAG_TAGS } from './a11y-support'

const pathPuzzle = pathGoldens[0]
const sudokuSolution = Array.from({ length: 9 }, (_, r) =>
	Array.from({ length: 9 }, (_, c) => ((r * 3 + Math.floor(r / 3) + c) % 9) + 1),
)
const sudokuPuzzle = {
	grid: sudokuSolution.map((row, r) => row.map((v, c) => (r === 8 && c === 8 ? null : v))),
	difficulty: 'easy',
}

const fiveGrid = '🟪🟧⬛⬛⬛\n🟪🟪🟪🟪🟪'

async function playFixture(page: Page, slug: 'number-path' | 'sudoku' | 'word-guess') {
	const isPath = slug === 'number-path'
	const isFive = slug === 'word-guess'
	const puzzleData = isFive
		? { wordLength: 5, maxAttempts: 6 }
		: isPath
			? pathPuzzle.puzzleData
			: sudokuPuzzle
	await page.setExtraHTTPHeaders({ 'CF-IPCountry': 'DE' })
	await page.route('**/v1/guest/session', (route) => route.fulfill({ json: { issued: true } }))
	await page.route('**/puzzled.v1.BillingService/GetSubscription', (route) =>
		route.fulfill({ json: { salesOpen: false } }),
	)
	const dayKey = productDayKey()
	const next = freeGameForDayKey(dayKey) === slug ? 'crowns' : freeGameForDayKey(dayKey)
	await page.route('**/puzzled.v1.PuzzleService/GetDaily', (route) =>
		route.fulfill({
			json:
				route.request().postDataJSON().gameSlug === next
					? { gameSlug: next, puzzleDate: dayKey, canPlay: true, requiresStart: true }
					: {
							gameSlug: slug,
							canPlay: true,
							puzzleDate: dayKey,
							puzzleDataJson: JSON.stringify(puzzleData),
						},
		}),
	)
	await page.route('**/puzzled.v1.PuzzleService/StartDaily', (route) =>
		route.fulfill({
			json: {
				daily: { gameSlug: next, puzzleDate: dayKey, canPlay: true, puzzleDataJson: '{}' },
			},
		}),
	)
	await page.route('**/puzzled.v1.PuzzleService/GetTodayProgress', (route) =>
		route.fulfill({
			json: {
				dayKey,
				freePicks: { gameSlugs: [slug] },
				games: [
					{ gameSlug: slug, hasCompleted: true },
					{ gameSlug: next, hasCompleted: false },
				],
			},
		}),
	)
	if (isFive) {
		await page.route('**/puzzled.v1.PuzzleService/CheckGuess', (route) => {
			const input = route.request().postDataJSON()
			expect(input).toMatchObject({ gameSlug: slug, puzzleDate: dayKey })
			const { word } = JSON.parse(input.guessJson)
			expect(['charm', 'couch']).toContain(word)
			const tiles =
				word === 'couch'
					? ['correct', 'correct', 'correct', 'correct', 'correct']
					: ['correct', 'present', 'absent', 'absent', 'absent']
			return route.fulfill({ json: { resultJson: JSON.stringify({ tiles }) } })
		})
	}
	await page.route('**/puzzled.v1.StatsService/GetTodayPercentile', (route) => {
		expect(route.request().postDataJSON()).toEqual({ gameSlug: slug, dayKey })
		return route.fulfill({
			json: isFive
				? {
						gameSlug: slug,
						dayKey,
						percentile: 73,
						totalPlayers: 15,
						dispatch: 'product_db_sessions',
					}
				: { gameSlug: slug, dayKey, totalPlayers: 3, dispatch: 'insufficient_cohort' },
		})
	})
	await page.route('**/puzzled.v1.PuzzleService/SubmitGuess', (route) =>
		route.fulfill({ json: { gameSlug: slug, valid: true, status: 'won', score: 487 } }),
	)
	await page.route('**/puzzled.v1.PuzzleService/ShareResult', (route) =>
		route.fulfill({ json: { shareId: fixtureShareId } }),
	)
	// Exercise a real late dock, rather than having to reproduce a race between
	// Chromium's first board layout and the consent response on a busy runner.
	const consent = Promise.withResolvers<void>()
	await page.route('**/api/consent-context', async (route) => {
		await consent.promise
		await route.continue()
	})
	const board = isFive
		? page.getByRole('table', { name: 'Five', exact: true })
		: page.locator('[data-play-canvas] .play-board')
	const dock = page.locator('[data-consent-banner]')
	let firstWidth: number
	try {
		await page.goto(`/games/${slug}?${slug === 'sudoku' ? 'difficulty=easy&' : ''}start=1#play`)
		await expect(board).toBeVisible()
		await expect(dock).toBeHidden()
		firstWidth = await board.evaluate((el) => el.getBoundingClientRect().width)
	} finally {
		consent.resolve()
	}
	await expect(dock).toBeVisible()
	await page.evaluate(() => document.fonts.ready)
	// Start the interaction only after the dock has reserved its actual row
	// and the resulting layout has had a paint opportunity. This does not
	// suppress a first-paint sizing regression: firstWidth was sampled above.
	await expect
		.poll(() =>
			dock.evaluate((el) => {
				const reserved = document.documentElement.style.getPropertyValue('--consent-bar-height')
				return Number.parseFloat(reserved) === el.getBoundingClientRect().height
			}),
		)
		.toBe(true)
	await page.evaluate(
		() =>
			new Promise<void>((painted) => {
				requestAnimationFrame(() => requestAnimationFrame(() => painted()))
			}),
	)
	return { board, next, firstWidth }
}

// Decode the browser's actual paint, not the DOM box or computed backdrop style.
async function paintedPixels(page: Page, png: Buffer, points: { x: number; y: number }[]) {
	return page.evaluate(
		async ({ png, points }) => {
			const bytes = Uint8Array.from(atob(png), (char) => char.charCodeAt(0))
			const image = await createImageBitmap(new Blob([bytes], { type: 'image/png' }))
			const canvas = new OffscreenCanvas(image.width, image.height)
			const ctx = canvas.getContext('2d')!
			ctx.drawImage(image, 0, 0)
			image.close()
			return points.map(({ x, y }) => Array.from(ctx.getImageData(x, y, 1, 1).data).slice(0, 3))
		},
		{ png: png.toString('base64'), points },
	)
}

async function canvasGeometry(page: Page) {
	return page.locator('.play-body').evaluate((canvas) => {
		const rect = (selector: string) =>
			document.querySelector(selector)?.getBoundingClientRect().toJSON()
		return {
			board: rect('.play-body .play-board')!,
			pathProgress: rect('[data-number-path-board] > .play-meta'),
			pathTools: rect('[data-number-path-board] > .play-tools'),
			card: rect('[data-board-finished]'),
			dock: rect('[data-consent-banner]')!,
			scroll: [
				scrollX,
				scrollY,
				canvas.scrollTop,
				canvas.scrollLeft,
				canvas.scrollHeight - canvas.clientHeight,
				canvas.scrollWidth - canvas.clientWidth,
			],
		}
	})
}

for (const viewport of [
	{ width: 1280, height: 803 },
	{ width: 1440, height: 900 },
	{ width: 390, height: 844 },
]) {
	const mobile = viewport.width === 390
	test.describe(viewport.width + '×' + viewport.height, () => {
		test.use({ viewport, isMobile: mobile, hasTouch: mobile })
		if (viewport.width !== 1280) {
			test('Five shares a spoiler-free challenge and saves its PNG separately', async ({
				page,
				context,
				baseURL,
			}, info) => {
				const origin = new URL(baseURL ?? 'http://localhost:3000').origin
				if (!['localhost', '127.0.0.1'].includes(new URL(origin).hostname)) {
					throw new Error('Completion checks require a loopback fixture')
				}
				await context.grantPermissions(['clipboard-read', 'clipboard-write'], { origin })
				await page.emulateMedia({ reducedMotion: 'reduce' })
				const shareEvents: unknown[] = []
				await page.route('**/puzzled.v1.FunnelService/RecordEvent', (route) => {
					const event = route.request().postDataJSON()
					if (event.event === 'share_clicked') shareEvents.push(event)
					return route.fulfill({ json: {} })
				})
				await page.route('**/puzzled.v1.GamificationService/GetStreakInfo', (route) =>
					route.fulfill({ json: { info: { currentStreak: 7, freezeUsedYesterday: true } } }),
				)
				await page.addInitScript(() => {
					const pending = Promise.withResolvers<void>()
					Reflect.set(window, 'resolveShare', pending.resolve)
					Object.defineProperty(navigator, 'share', {
						value: ({ text }: ShareData) => {
							Reflect.set(window, 'nativeCaption', text)
							return pending.promise
						},
					})
				})
				const prefetched = page.waitForResponse(
					(response) => response.url().endsWith('/ShareResult') && response.ok(),
				)
				const { board } = await playFixture(page, 'word-guess')
				const keyboard = page
					.locator('fieldset')
					.filter({ has: page.getByRole('button', { name: 'Enter', exact: true }) })
				for (const word of ['charm', 'couch']) {
					for (const key of word.toUpperCase()) {
						const button = keyboard.getByRole('button', { name: key, exact: true })
						if (mobile) await button.tap()
						else await button.click()
					}
					const enter = keyboard.getByRole('button', { name: 'Enter', exact: true })
					if (mobile) await enter.tap()
					else await enter.click()
					await expect(
						board
							.locator('tr')
							.nth(word === 'charm' ? 0 : 1)
							.locator('td')
							.first(),
					).toHaveAttribute('data-grade', 'correct')
				}

				const card = page.locator('[data-board-finished]')
				const patternName = 'Pattern: 6 hit / 1 near / 3 miss'
				const expectedRows = [['hit', 'near', 'miss', 'miss', 'miss'], Array(5).fill('hit')]
				const expectPattern = async (panel: typeof card) => {
					const grid = panel.getByRole('img', { name: patternName })
					await expect(grid).toBeVisible()
					expect(
						await grid
							.locator('.result-preview-row')
							.evaluateAll((rows) =>
								rows.map((row) =>
									Array.from(row.children, (cell) => cell.getAttribute('data-tile')),
								),
							),
					).toEqual(expectedRows)
					await expect(grid).toHaveText('')
				}
				await expectPattern(card)
				await expect(card.locator('[data-result-percentile]')).toHaveText(
					'You placed ahead of 73% of today’s players',
				)
				await prefetched
				expect(shareEvents).toEqual([])
				await expect(card.locator('[data-result-milestone="7"]')).toHaveText(
					'7-day streak. Nicely played!',
				)
				await expect(card.locator('[data-result-freeze-saved]')).toHaveText(
					'Streak saved by a freeze',
				)
				const capture = card.locator('[data-result-guest-capture]')
				await expect(capture).toHaveCount(1)
				await expect(capture).toContainText('keep your streak of 7 days')
				const signIn = capture.getByRole('link', { name: 'Create a free account', exact: true })
				await expect(signIn).toHaveAttribute('href', '/sign-in?callbackUrl=%2Fstats')
				const nextAction = card.locator('.result-next')
				const shareRow = card.locator('.result-action-row')
				const captureBox = (await capture.boundingBox())!
				const nextBox = (await nextAction.boundingBox())!
				const shareBox = (await shareRow.boundingBox())!
				expect(captureBox.y).toBeGreaterThanOrEqual(shareBox.y + shareBox.height)
				expect(shareBox.y).toBeGreaterThanOrEqual(nextBox.y + nextBox.height)
				const assertNoOverflow = async () => {
					const overflow = await page.evaluate(() =>
						[
							document.documentElement,
							...document.querySelectorAll(
								'.play-body, [data-board-finished], [data-result-guest-capture], .result-dialog[open]',
							),
						]
							.map((el) => [el.className, el.scrollWidth - el.clientWidth])
							.filter(([, overflow]) => overflow !== 0),
					)
					expect(overflow).toEqual([])
				}
				await assertNoOverflow()
				await page.screenshot({ path: info.outputPath('five-win.png') })

				const downloads: string[] = []
				page.on('download', (download) => downloads.push(download.suggestedFilename()))
				const readClipboard = () => page.evaluate(() => navigator.clipboard.readText())
				const railCopy = card.getByRole('button', { name: 'Copy challenge', exact: true })
				await railCopy.click()
				await expect(card.getByText('Challenge copied', { exact: true })).toBeVisible()
				const caption = await readClipboard()
				expect(caption).toContain(fiveGrid)
				const link = new URL(caption.split(' ').at(-1) ?? '')
				expect(link.pathname + link.search).toBe('/r/' + fixtureShareId + '?utm_source=share')
				expect(caption).not.toMatch(/charm|couch|placed ahead/i)
				expect(downloads).toEqual([])

				await card.getByRole('button', { name: 'See your result' }).click()
				const dialog = page.getByRole('dialog', { name: 'Five Complete' })
				await expectPattern(dialog)
				await assertNoOverflow()
				await page.screenshot({ path: info.outputPath('five-details.png') })
				const copy = dialog.getByRole('button', { name: 'Copy challenge', exact: true })
				const save = dialog.getByRole('button', { name: 'Save PNG', exact: true })
				const native = dialog.getByRole('button', { name: 'Share result', exact: true })
				for (const action of [railCopy, copy, save, native, signIn, nextAction]) {
					const box = (await action.boundingBox())!
					expect(Math.min(box.width, box.height)).toBeGreaterThanOrEqual(44)
				}
				await expect(copy).toHaveCSS('background-color', 'rgb(32, 30, 26)')
				await expect(save).toHaveCSS('background-color', 'rgb(255, 255, 255)')
				const saved = page.waitForEvent('download')
				await save.click()
				const download = await saved
				expect(download.suggestedFilename()).toMatch(/^tryit-result-word-guess-.*.png$/)
				const png = await readFile((await download.path())!)
				const pixels = await paintedPixels(page, png, [
					{ x: 340, y: 780 },
					{ x: 440, y: 780 },
					{ x: 540, y: 780 },
					{ x: 540, y: 880 },
				])
				expect(pixels).toEqual([
					[139, 85, 197],
					[237, 154, 66],
					[64, 61, 76],
					[139, 85, 197],
				])
				expect(await readClipboard()).toBe(caption)

				// Keep the share promise pending and dispatch a second click synchronously.
				await native.evaluate((button: HTMLButtonElement) => {
					button.click()
					button.click()
				})
				await expect(native).toHaveAttribute('aria-disabled', 'true')
				await expect
					.poll(() => page.evaluate(() => Reflect.get(window, 'nativeCaption')))
					.toBe(caption)
				await page.evaluate(() => Reflect.get(window, 'resolveShare')())
				await expect(native).toBeEnabled()
				await expect
					.poll(() => shareEvents)
					.toEqual(
						['copy_challenge', 'save_png', 'native_share'].map((action) => ({
							event: 'share_clicked',
							gameSlug: 'word-guess',
							action,
							hasPercentile: true,
						})),
					)
			})
		}
		for (const slug of ['number-path', 'sudoku'] as const) {
			test(
				slug + ' finishes in place with consent open',
				async ({ page, baseURL, context }, info) => {
					const origin = new URL(baseURL ?? 'http://localhost:3000').origin
					if (!['localhost', '127.0.0.1'].includes(new URL(origin).hostname)) {
						throw new Error('Completion checks require a loopback fixture')
					}
					await page.emulateMedia({ reducedMotion: 'reduce' })
					await context.grantPermissions(['clipboard-read', 'clipboard-write'], { origin })
					const { board, next, firstWidth } = await playFixture(page, slug)
					const elapsed = page.waitForRequest((request) => request.url().endsWith('/SubmitGuess'))
					const percentile = page.waitForResponse((response) =>
						response.url().endsWith('/GetTodayPercentile'),
					)
					const before = await canvasGeometry(page)
					// Both boards fit the width on this phone and the board column on
					// these desktops, including at first render with the dock held back.
					const width = mobile ? 358 : 546
					expect(Math.abs(firstWidth - width)).toBeLessThanOrEqual(1)
					expect(Math.abs(before.board.width - firstWidth)).toBeLessThanOrEqual(1)
					expect(before.scroll).toEqual([0, 0, 0, 0, 0, 0])
					if (slug === 'number-path') {
						await page.screenshot({ path: info.outputPath('path-before.png') })
						if (mobile) {
							expect(before.board.width).toBe(viewport.width - 32)
						} else {
							// Compare the centers of the entire in-play control stack and board,
							// not an absolute top gap that varies with the available height.
							const { board, pathProgress, pathTools } = before
							const railCenter = (pathProgress!.top + pathTools!.bottom) / 2
							const boardCenter = (board.top + board.bottom) / 2
							expect(pathProgress!.left).toBeGreaterThan(board.right)
							expect(
								Math.abs(railCenter - boardCenter),
								JSON.stringify(before),
							).toBeLessThanOrEqual(1)
						}
						for (const { row, col } of pathPuzzle.solution.path) {
							const cell = board.getByRole('button', {
								name: new RegExp('^Row ' + (row + 1) + ', Column ' + (col + 1) + '(?:,|$)'),
							})
							if (mobile) await cell.tap()
							else await cell.click()
						}
					} else {
						const cell = board.getByRole('button', { name: 'Row 9, Column 9', exact: true })
						const key = page.getByRole('button', {
							name: String(sudokuSolution[8][8]),
							exact: true,
						})
						if (mobile) {
							await cell.tap()
							await key.tap()
						} else {
							await cell.click()
							await key.click()
						}
					}
					const card = page.locator('[data-board-finished]')
					await expect(card).toBeVisible()
					const after = await canvasGeometry(page)
					for (const coordinate of ['top', 'left', 'width', 'height']) {
						expect(
							Math.abs(after.board[coordinate] - before.board[coordinate]),
							JSON.stringify({ before, after }),
						).toBeLessThanOrEqual(1)
					}
					expect(after.scroll).toEqual([0, 0, 0, 0, 0, 0])
					expect(after.card!.bottom).toBeLessThanOrEqual(after.dock.top)
					if (mobile) expect(after.card!.top).toBeGreaterThanOrEqual(after.board.bottom)
					else {
						expect(after.card!.left).toBeGreaterThan(after.board.right)
						expect(after.card!.top).toBeGreaterThanOrEqual(after.board.top)
						expect(after.card!.bottom).toBeLessThanOrEqual(after.board.bottom)
					}
					if (slug === 'number-path')
						await page.screenshot({ path: info.outputPath('path-solved.png') })

					expect(await (await percentile).json()).not.toHaveProperty('percentile')
					const trigger = card.getByRole('button', { name: 'See your result' })
					const dialog = page.getByRole('dialog', {
						name: slug === 'number-path' ? 'Path Complete' : 'Sudoku Complete',
					})
					await trigger.click()
					await expect(dialog.getByRole('heading', { level: 2 })).toBeFocused()
					await expect(dialog.getByRole('heading', { level: 2 })).toHaveCSS('outline-style', 'none')
					await expect(dialog.getByRole('button', { name: 'Dismiss' })).toHaveCSS(
						'outline-style',
						'none',
					)
					await expect(dialog.locator('.result-stats > div')).toHaveCount(3)
					await expect(dialog.locator('.result-stats dd')).toHaveText([
						'1',
						'487',
						await elapsed.then((request) => {
							const seconds = Math.floor(Number(request.postDataJSON().timeSpentMs) / 1000)
							return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`
						}),
					])
					await expect(dialog.locator('.result-stats > div').first()).toHaveCSS(
						'background-color',
						'rgb(247, 245, 240)',
					)
					await expect(dialog.locator('canvas, .result-preview')).toHaveCount(0)
					await expect(dialog.getByText('Tryit result card')).toHaveCount(0)
					await expect(card).toHaveCSS('opacity', '0')
					expect((await canvasGeometry(page)).board).toEqual(after.board)
					await expect(dialog.getByText('1 of 3 free picks used today')).toBeVisible()
					await expect(dialog.locator('.result-steps > span')).toHaveCount(3)
					await expect(dialog.locator('.result-steps [data-filled]')).toHaveCount(1)
					const playNext = dialog.getByRole('link', { name: /^Play next:/ })
					// The rotation picks the next game by product day; its link uses the
					// public path (word-groups is /games/quartet) and the internal intent.
					await expect(playNext).toHaveAttribute(
						'href',
						new RegExp(`^${gamePath(next)}\\?.*start=1#play$`),
					)
					await expect(playNext).toHaveAttribute('data-start-intent', next)
					await expect(dialog.getByRole('link', { name: 'All games' })).toHaveAttribute(
						'href',
						'/games',
					)
					const dialogRect = (await dialog.boundingBox())!
					expect(dialogRect.y + dialogRect.height).toBeLessThanOrEqual(after.dock.top)
					expect(
						await dialog.evaluate((el) => getComputedStyle(el, '::backdrop').backdropFilter),
					).toBe('blur(5px)')
					const badAncestors = await dialog.evaluate((el) => {
						const invisible: string[] = []
						for (let ancestor: Element | null = el; ancestor; ancestor = ancestor.parentElement) {
							const { opacity, visibility } = getComputedStyle(ancestor)
							if (Number.parseFloat(opacity) !== 1 || visibility !== 'visible') {
								invisible.push(
									`${ancestor.tagName}.${ancestor.className}: opacity=${opacity}, visibility=${visibility}`,
								)
							}
						}
						return invisible
					})
					expect(badAncestors).toEqual([])
					await expect(page.locator('dialog.result-dialog:modal')).toHaveCount(1)
					const scrim = { x: 8, y: 8 } // Clear of the dialog and dock at every tested size.
					let openScrim: number[] | undefined
					if (slug === 'number-path') {
						const cta = (await playNext.boundingBox())!
						// Clicking the rail's "See your result" can leave .result-next hovered.
						if (!mobile) await page.mouse.move(scrim.x, scrim.y)
						const result = await page.screenshot({
							path: info.outputPath('path-result.png'),
							scale: 'css',
						})
						const [shade, paper, amber] = await paintedPixels(page, result, [
							scrim,
							{ x: dialogRect.x + 12, y: dialogRect.y + 36 },
							{ x: cta.x + 20, y: cta.y + cta.height / 2 },
						])
						openScrim = shade
						expect(paper).toEqual([255, 255, 255])
						expect(amber).toEqual([244, 180, 42])
						const axe = await new AxeBuilder({ page })
							.include('.result-dialog')
							.withTags(WCAG_TAGS)
							.analyze()
						expect(axe.violations).toEqual([])
					}
					const share = dialog.getByRole('button', { name: 'Copy challenge' })
					const save = dialog.getByRole('button', { name: 'Save PNG' })
					const close = dialog.getByRole('button', { name: 'Dismiss' })
					for (const action of [playNext, share, save, close]) {
						const box = (await action.boundingBox())!
						expect(Math.min(box.width, box.height)).toBeGreaterThanOrEqual(44)
						expect(
							await action.evaluate((el) => {
								const r = el.getBoundingClientRect()
								return el.contains(
									document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2),
								)
							}),
						).toBe(true)
					}
					await share.click()
					await expect(dialog.getByRole('status')).toHaveText('Challenge copied')
					await expect
						.poll(() => page.evaluate(() => navigator.clipboard.readText()))
						.toContain(`/r/${fixtureShareId}?utm_source=share`)
					const saved = page.waitForEvent('download')
					await save.click()
					const download = await saved
					expect(download.suggestedFilename()).toMatch(/^tryit-result-.*\.png$/)
					const png = await readFile((await download.path())!)
					expect(png.subarray(0, 8).toString('hex')).toBe('89504e470d0a1a0a')
					expect(png.readUInt32BE(16)).toBe(1080)
					expect(png.readUInt32BE(20)).toBe(1080)
					await close.click()
					await expect(trigger).toBeFocused()
					await expect(card).toHaveCSS('opacity', '1')
					await expect(card.locator('[data-result-percentile]')).toHaveCount(0)
					expect((await canvasGeometry(page)).board).toEqual(after.board)
					if (openScrim) {
						const dismissed = await page.screenshot({
							path: info.outputPath('path-dismissed.png'),
							scale: 'css',
						})
						const [closedScrim] = await paintedPixels(page, dismissed, [scrim])
						for (const [channel, value] of closedScrim.entries()) {
							expect(value - openScrim[channel]).toBeGreaterThan(50)
						}
					}
					await trigger.press('Enter')
					await expect(dialog).toBeVisible()
					await page.keyboard.press('Shift+Tab')
					await expect(close).toBeFocused()
					await expect(close).toHaveCSS('outline-style', 'solid')
					await page.keyboard.press('Escape')
					await expect(dialog).toBeHidden()
					await expect(trigger).toBeFocused()
					await expect(page.locator('[data-consent-banner]')).toBeVisible()
					expect((await canvasGeometry(page)).scroll).toEqual(before.scroll)
					if (slug === 'number-path') {
						await trigger.click()
						const started = page.waitForRequest((request) => request.url().endsWith('/StartDaily'))
						await playNext.click()
						expect((await started).postDataJSON()).toMatchObject({ gameSlug: next })
						await expect(page).toHaveURL(new RegExp(`${gamePath(next)}\\?.*start=1#play$`))
					}
				},
			)
		}
	})
}
