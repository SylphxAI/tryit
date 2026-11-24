import { readFile } from 'node:fs/promises'
import AxeBuilder from '@axe-core/playwright'
import { expect, type Page, test } from '@playwright/test'
import pathGoldens from '../../../crates/puzzled-core/tests/fixtures/generate/number-path.json'
import { fixtureShareId } from '../scripts/share-fixture-facts'
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

async function playFixture(page: Page, slug: 'number-path' | 'sudoku') {
	const isPath = slug === 'number-path'
	await page.setExtraHTTPHeaders({ 'CF-IPCountry': 'DE' })
	await page.route('**/v1/guest/session', (route) => route.fulfill({ json: { issued: true } }))
	await page.route('**/puzzled.v1.BillingService/GetSubscription', (route) =>
		route.fulfill({ json: { salesOpen: false } }),
	)
	await page.route('**/puzzled.v1.PuzzleService/GetDaily', (route) =>
		route.fulfill({
			json: {
				gameSlug: slug,
				canPlay: true,
				puzzleDate: productDayKey(),
				puzzleDataJson: JSON.stringify(isPath ? pathPuzzle.puzzleData : sudokuPuzzle),
			},
		}),
	)
	await page.route('**/puzzled.v1.PuzzleService/SubmitGuess', (route) =>
		route.fulfill({ json: { gameSlug: slug, valid: true, status: 'won', score: 487 } }),
	)
	await page.route('**/puzzled.v1.PuzzleService/ShareResult', (route) =>
		route.fulfill({ json: { shareId: fixtureShareId } }),
	)
	await page.goto('/games/' + slug + '?' + (isPath ? '' : 'difficulty=easy&') + 'start=1#play')
	const board = page.locator('[data-play-canvas] .play-board')
	await expect(board).toBeVisible()
	await expect(page.locator('[data-consent-banner]')).toBeVisible()
	await page.evaluate(() => document.fonts.ready)
	return board
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
					const board = await playFixture(page, slug)
					const before = await canvasGeometry(page)
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
						'Under a minute',
					])
					await expect(dialog.locator('.result-stats > div').first()).toHaveCSS(
						'background-color',
						'rgb(247, 245, 240)',
					)
					await expect(dialog.locator('canvas[data-painted]')).toBeVisible()
					const dialogRect = (await dialog.boundingBox())!
					expect(dialogRect.y + dialogRect.height).toBeLessThanOrEqual(after.dock.top)
					expect(
						await dialog.evaluate((el) => getComputedStyle(el, '::backdrop').backdropFilter),
					).toBe('blur(8px)')
					if (slug === 'number-path') {
						await page.screenshot({ path: info.outputPath('path-result.png') })
						const axe = await new AxeBuilder({ page })
							.include('.result-dialog')
							.withTags(WCAG_TAGS)
							.analyze()
						expect(axe.violations).toEqual([])
					}
					const share = dialog.getByRole('button', { name: 'Share Result' })
					const save = dialog.getByRole('button', { name: 'Save PNG' })
					const close = dialog.getByRole('button', { name: 'Dismiss' })
					for (const action of [share, save, close]) {
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
					// Chromium without an OS share sheet exercises the real clipboard path.
					await share.click()
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
				},
			)
		}
	})
}
