import { expect, type Locator, type Page, test } from '@playwright/test'
import { productDayKey } from '../src/lib/product-day'
import { FIRST_FINISH_DAY_KEY } from '../src/lib/storage-keys'

// The dev transport uses :3001 while production is same-origin. Only local
// intercepted-RPC runs opt out of CSP; the served production CI build does not.
const localDevCsp = process.env.PUZZLED_TEST_DEV_CSP === '1'
if (
	localDevCsp &&
	(process.env.GITHUB_ACTIONS === 'true' ||
		!['localhost', '127.0.0.1'].includes(
			new URL(process.env.BASE_URL || 'http://localhost:3000').hostname,
		))
) {
	throw new Error(
		'Dev CSP opt-out is only allowed for local intercepted-RPC tests, never CI or live',
	)
}
test.use({ bypassCSP: localDevCsp })

/** A complete Sudoku used only to serve a deterministic browser-test board. */
const solution = Array.from({ length: 9 }, (_, r) =>
	Array.from({ length: 9 }, (_, c) => ((r * 3 + Math.floor(r / 3) + c) % 9) + 1),
)

const today = productDayKey()
const firstFinish = (page: Page) =>
	page.evaluate((key) => localStorage.getItem(key), FIRST_FINISH_DAY_KEY)

test('Sudoku waits for acceptance, shows rejection, and retries without false local completion', async ({
	page,
}) => {
	await page.route('**/puzzled.v1.PuzzleService/GetDaily', async (route) => {
		await route.fulfill({
			json: {
				gameSlug: 'sudoku',
				difficulty: 'easy',
				canPlay: true,
				puzzleDate: today,
				puzzleDataJson: JSON.stringify({
					grid: solution.map((row, r) => row.map((v, c) => (r === 8 && c === 8 ? null : v))),
					difficulty: 'easy',
				}),
			},
		})
	})
	let submissions = 0
	let release: (() => void) | undefined
	const pending = new Promise<void>((resolve) => {
		release = resolve
	})
	await page.route('**/puzzled.v1.PuzzleService/SubmitGuess', async (route) => {
		submissions++
		if (submissions === 1) {
			await pending
			await route.fulfill({
				json: { valid: false, error: 'Sudoku test authority rejected this finish' },
			})
		} else {
			await route.fulfill({ json: { valid: true, status: 'won', score: 900, gameSlug: 'sudoku' } })
		}
	})
	await page.goto('/games/sudoku?difficulty=easy&start=1#play')
	const board = page.getByRole('group', { name: 'Sudoku', exact: true })
	await expect(board).toBeVisible()
	const finish = page.getByText('Puzzle Complete!', { exact: true })
	const retry = page.getByRole('button', { name: 'Try again', exact: true })
	await cell(board, 9, 9).click()
	await page.keyboard.press(String(solution[8][8]))
	await expect.poll(() => submissions).toBe(1)
	await expect(finish).toHaveCount(0)
	expect(await firstFinish(page)).toBeNull()
	release?.()
	await expect(retry).toBeVisible()
	await expect(finish).toHaveCount(0)
	expect(await firstFinish(page)).toBeNull()
	await expect(board).toBeVisible()
	await retry.click()
	await expect(finish).toBeVisible()
	expect(submissions).toBe(2)
	await expect.poll(() => firstFinish(page)).toBe(today)
})

for (const slug of ['nonogram', 'crowns'] as const) {
	test(`${slug} rejection keeps the board and retries without a result or local completion`, async ({
		page,
	}) => {
		const puzzle =
			slug === 'nonogram'
				? { width: 1, height: 1, rowClues: [[1]], colClues: [[1]] }
				: { size: 4, regions: Array.from({ length: 4 }, (_, r) => Array<number>(4).fill(r)) }
		await page.route('**/puzzled.v1.PuzzleService/GetDaily', (route) =>
			route.fulfill({
				json: {
					gameSlug: slug,
					difficulty: 'easy',
					canPlay: true,
					puzzleDate: today,
					puzzleDataJson: JSON.stringify(puzzle),
				},
			}),
		)
		let submissions = 0
		await page.route('**/puzzled.v1.PuzzleService/SubmitGuess', (route) => {
			submissions++
			return route.fulfill({
				json:
					submissions === 1
						? { valid: false, error: `${slug} test authority rejected this finish` }
						: { valid: true, status: 'won', score: 900, gameSlug: slug },
			})
		})
		await page.goto(`/games/${slug}?difficulty=easy&start=1#play`)
		const board = page.locator('[data-game-stage="board"]')
		const finish = board.getByText(slug === 'nonogram' ? 'Picture Complete!' : 'Puzzle Complete!', {
			exact: true,
		})
		const cells = board.getByRole('button', { name: /^Row \d+, Column \d+/ })
		await expect(cells).toHaveCount(slug === 'nonogram' ? 1 : 16)
		if (slug === 'nonogram') await cells.first().click()
		else for (const index of [1, 7, 8, 14]) await cells.nth(index).click()
		const retry = board.getByRole('button', { name: 'Try again', exact: true })
		await expect(retry).toBeVisible()
		await expect(finish).toHaveCount(0)
		expect(await firstFinish(page)).toBeNull()
		await expect(cells.first()).toBeVisible()
		await retry.click()
		await expect(finish).toBeVisible()
		expect(submissions).toBe(2)
		await expect.poll(() => firstFinish(page)).toBe(today)
	})
}

const undoGrid = Array.from({ length: 9 }, (_, row) =>
	Array.from({ length: 9 }, (_, col) => (row === 8 && col === 8 ? 9 : null)),
)

async function openBoard(page: Page) {
	await page.route('**/v1/guest/session', (route) => route.fulfill({ json: { issued: false } }))
	await page.route('**/puzzled.v1.PuzzleService/GetDaily', (route) =>
		route.fulfill({
			json: {
				gameSlug: 'sudoku',
				difficulty: 'hard',
				canPlay: true,
				puzzleDate: today,
				puzzleDataJson: JSON.stringify({ grid: undoGrid, difficulty: 'hard' }),
			},
		}),
	)
	await page.goto('/games/sudoku?difficulty=hard&start=1#play')
	return page.getByRole('group', { name: 'Sudoku', exact: true })
}

const cell = (board: Locator, row: number, col: number) =>
	board.getByRole('button', { name: new RegExp(`^Row ${row}, Column ${col}(,|$)`) })

async function boardState(board: Locator) {
	return board.locator('button').evaluateAll((cells) =>
		cells.map((button) => ({
			label: button.getAttribute('aria-label'),
			notes: [...button.querySelectorAll('span.grid > span')]
				.filter((note) => getComputedStyle(note).opacity !== '0')
				.map((note) => note.textContent),
		})),
	)
}

for (const viewport of [
	{ width: 1280, height: 900 },
	{ width: 390, height: 844 },
]) {
	test(`Sudoku undo restores pruned notes in one action at ${viewport.width}px`, async ({
		page,
	}) => {
		await page.setViewportSize(viewport)
		let submissions = 0
		await page.route('**/puzzled.v1.PuzzleService/SubmitGuess', (route) => {
			submissions++
			return route.fulfill({ json: { valid: false } })
		})
		const board = await openBoard(page)
		const undo = page.getByRole('button', { name: 'Undo', exact: true })
		await expect(undo).toBeDisabled()
		await page.getByRole('button', { name: 'Notes', exact: true }).click()
		for (const [row, col] of [
			[1, 5],
			[5, 1],
			[2, 2],
		]) {
			await cell(board, row, col).click()
			await page.keyboard.press('5')
		}
		await page.getByRole('button', { name: 'Notes Mode', exact: true }).click()
		await cell(board, 1, 1).click()
		const before = await boardState(board)
		expect(before).toHaveLength(81)
		await page.keyboard.press('5')
		expect((await boardState(board)).filter((c) => c.notes.includes('5'))).toHaveLength(0)
		await undo.click()
		expect(await boardState(board)).toEqual(before)
		expect(submissions).toBe(0)

		// A selection and a no-op given-cell edit must not hide the last real edit.
		await cell(board, 9, 9).click()
		await page.keyboard.press('1')
		await page.keyboard.press('Control+z')
		expect((await boardState(board)).filter((c) => c.notes.includes('5'))).toHaveLength(2)
		await expect(cell(board, 9, 9)).toHaveAttribute('aria-label', 'Row 9, Column 9, 9')
		expect(submissions).toBe(0)
		await page.screenshot({ path: test.info().outputPath(`sudoku-undo-${viewport.width}.png`) })
	})
}

test('Undo keyboard shortcut leaves text-field editing to the browser', async ({ page }) => {
	const board = await openBoard(page)
	await cell(board, 1, 1).click()
	await page.keyboard.press('2')
	// The canvas intentionally hides the landing page's other children. Put the
	// test field in the visible play body while Sudoku's global handler is live.
	await page.locator('[data-play-canvas] .play-body').evaluate((body) => {
		const input = document.createElement('input')
		input.setAttribute('aria-label', 'Undo test text field')
		body.prepend(input)
	})
	const input = page.getByRole('textbox', { name: 'Undo test text field' })
	await expect(input).toBeVisible()
	await input.pressSequentially('hello')
	await expect(input).toBeFocused()
	await expect(input).toHaveValue('hello')
	await page.keyboard.press('Control+z')
	await expect(input).toHaveValue('')
	await expect(cell(board, 1, 1)).toHaveAttribute('aria-label', 'Row 1, Column 1, 2')
	await cell(board, 1, 1).click()
	await page.keyboard.press('Meta+z')
	await expect(cell(board, 1, 1)).toHaveAttribute('aria-label', 'Row 1, Column 1')
})

for (const viewport of [
	{ width: 1440, height: 900 },
	{ width: 390, height: 844 },
]) {
	for (const colorScheme of ['light', 'dark'] as const) {
		const hasTouch = viewport.width === 390
		test.describe(`Sudoku duplicate feedback at ${viewport.width}px in ${colorScheme} mode`, () => {
			test.use({ viewport, colorScheme, hasTouch })

			test('marks and clears every conflicting cell, including given clues', async ({ page }) => {
				const grid = Array.from({ length: 9 }, () => Array<number | null>(9).fill(null))
				grid[0][0] = grid[5][2] = grid[7][7] = 8
				await page.route('**/v1/guest/session', (route) =>
					route.fulfill({ json: { issued: false } }),
				)
				await page.route('**/puzzled.v1.PuzzleService/GetDaily', (route) =>
					route.fulfill({
						json: {
							gameSlug: 'sudoku',
							difficulty: 'easy',
							canPlay: true,
							puzzleDate: today,
							puzzleDataJson: JSON.stringify({ grid, difficulty: 'easy' }),
						},
					}),
				)
				await page.goto('/games/sudoku?difficulty=easy&start=1#play')
				const board = page.getByRole('group', { name: 'Sudoku', exact: true })
				await expect(board.getByRole('button')).toHaveCount(81)
				const status = page.getByRole('status').getByText('Duplicate number in row, column, or box')
				const red = colorScheme === 'dark' ? 'rgb(242, 123, 112)' : 'rgb(168, 43, 35)'
				const press = (button: Locator) => (hasTouch ? button.tap() : button.click())
				const key = (name: string) => page.getByRole('button', { name, exact: true })
				async function expectConflict(square: Locator, digit: string, selected: boolean) {
					await expect(square).toHaveAttribute('data-conflict', 'true')
					await expect(square).toHaveAttribute('aria-invalid', 'true')
					const value = square.getByText(digit, { exact: true })
					await expect(value).toHaveCSS('color', red)
					await expect(value).toHaveCSS('text-decoration-line', 'underline')
					await expect(value).toHaveCSS('text-decoration-style', 'wavy')
					await expect(square).toHaveCSS(
						'box-shadow',
						`${red} 0px 0px 0px ${selected ? 3 : 2}px inset`,
					)
					const mark = square.getByText('!', { exact: true })
					await expect(mark).toBeVisible()
					await expect(mark).toHaveCSS('color', red)
					// Resolve the painted tint (CSS color-mix) to sRGB before measuring WCAG contrast.
					await expect
						.poll(() =>
							square.evaluate((button) => {
								const ctx = document.createElement('canvas').getContext('2d')
								if (!ctx) throw new Error('Cannot measure Sudoku conflict contrast')
								const { color, backgroundColor } = getComputedStyle(button)
								const luminance = (cssColor: string) => {
									ctx.clearRect(0, 0, 1, 1)
									ctx.fillStyle = cssColor
									ctx.fillRect(0, 0, 1, 1)
									const channels = ctx.getImageData(0, 0, 1, 1).data
									return [0.2126, 0.7152, 0.0722].reduce((sum, weight, i) => {
										const s = channels[i] / 255
										return sum + weight * (s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4)
									}, 0)
								}
								const fg = luminance(color)
								const bg = luminance(backgroundColor)
								return (Math.max(fg, bg) + 0.05) / (Math.min(fg, bg) + 0.05)
							}),
						)
						.toBeGreaterThanOrEqual(4.5)
				}
				async function expectNoConflicts() {
					await expect(board.locator('[data-conflict], [aria-invalid]')).toHaveCount(0)
					await expect(board.getByText('!', { exact: true })).toHaveCount(0)
					await expect(status).toHaveCount(0)
				}

				await expectNoConflicts()
				const player = cell(board, 1, 3)
				await press(player)
				await press(key('8'))
				const rowClue = cell(board, 1, 1)
				const columnClue = cell(board, 6, 3)
				await expect(rowClue).toHaveAttribute('data-given', 'true')
				await expect(columnClue).toHaveAttribute('data-given', 'true')
				await expectConflict(player, '8', true)
				await expectConflict(rowClue, '8', false)
				await expectConflict(columnClue, '8', false)
				await expect(cell(board, 8, 8)).not.toHaveAttribute('data-conflict')
				await expect(board.locator('[data-conflict="true"]')).toHaveCount(3)
				await expect(status).toBeVisible()
				if (!hasTouch) {
					await rowClue.hover()
					await expectConflict(rowClue, '8', false)
				}
				await press(key('Clear'))
				await expectNoConflicts()

				const first = cell(board, 1, 5)
				const second = cell(board, 1, 6)
				await press(first)
				await press(key('4'))
				await expectNoConflicts()
				await press(second)
				await press(key('4'))
				await expectConflict(first, '4', false)
				await expectConflict(second, '4', true)
				await expect(board.locator('[data-conflict="true"]')).toHaveCount(2)
				await expect(status).toBeVisible()
				await press(key('Undo'))
				await expectNoConflicts()
				await expect(first).toHaveAccessibleName('Row 1, Column 5, 4')

				await press(player)
				await press(key('8'))
				await expect(board.locator('[data-conflict="true"]')).toHaveCount(3)
				page.once('dialog', (dialog) => dialog.accept())
				await press(key('Start over'))
				await expectNoConflicts()
			})
		})
	}
}
