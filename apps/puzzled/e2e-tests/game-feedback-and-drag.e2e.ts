import { expect, type Locator, type Page, test } from '@playwright/test'
import nonogram from '../../../crates/puzzled-core/tests/fixtures/generate/nonogram.json'

// Against the production build paired with scripts/serve-puzzle-fixture.ts.
// Keep the frozen boards intact and intercept all grading and finish requests.
test.beforeEach(async ({ page, baseURL }) => {
	if (!['localhost', '127.0.0.1'].includes(new URL(baseURL ?? 'http://localhost:3000').hostname)) {
		throw new Error('Game feedback checks require a local fixture')
	}
	await page.route('**/v1/guest/session', (route) => route.fulfill({ json: { issued: true } }))
	await page.route('**/puzzled.v1.PuzzleService/SubmitGuess', (route) => route.abort())
	await page.route('**/puzzled.v1.PuzzleService/CheckGuess', (route) => route.abort())
})

async function open(page: Page, slug: string, difficulty?: string, locale = 'en-US') {
	await page.goto(`/${locale}/games/${slug}${difficulty ? `?difficulty=${difficulty}` : ''}#play`)
	const decline = page.getByRole('button', { name: /^(Decline|拒絕)$/ })
	if (await decline.isVisible()) await decline.click()
	const board = page.locator('[data-game-stage="board"]')
	await expect(board).toBeVisible()
	return board
}

async function center(locator: Locator) {
	const box = await locator.boundingBox()
	if (!box) throw new Error('Expected a visible drag target')
	return { x: box.x + box.width / 2, y: box.y + box.height / 2 }
}

async function mouseDrag(page: Page, from: Locator, to: Locator) {
	await from.scrollIntoViewIfNeeded()
	const start = await center(from)
	const end = await center(to)
	await page.mouse.move(start.x, start.y)
	await page.mouse.down()
	await page.mouse.move(end.x, end.y, { steps: 12 })
	await page.mouse.up()
}

// CDP touch dispatch exercises native PointerEvents and compatibility clicks.
// DOM-dispatched events cannot reproduce pointer capture or a dropped first tap.
async function touchDrag(page: Page, from: Locator, to: Locator) {
	await from.scrollIntoViewIfNeeded()
	const start = await center(from)
	const end = await center(to)
	const touch = await page.context().newCDPSession(page)
	try {
		await touch.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [start] })
		for (let step = 1; step <= 8; step++) {
			const x = start.x + ((end.x - start.x) * step) / 8
			const y = start.y + ((end.y - start.y) * step) / 8
			await touch.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x, y }] })
		}
		await touch.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] })
	} finally {
		await touch.detach()
	}
}

test('Path highlights clue 1, explains blocked moves, then advances by taps and drag', async ({
	page,
}) => {
	await page.emulateMedia({ reducedMotion: 'no-preference' })
	const board = await open(page, 'number-path')
	const cell = (row: number, col: number) =>
		board.getByRole('button', { name: new RegExp(`^Row ${row}, Column ${col}(?:,|$)`) })
	const first = cell(4, 4)
	const startHighlight = first.locator('[data-start]')
	const progress = board.locator('output')
	await expect(progress).toHaveText('0/36')
	await expect(startHighlight).toHaveCSS('animation-name', 'pulse')
	await cell(1, 1).click()
	await expect(board.getByText('Start at 1', { exact: true })).toBeVisible()
	await expect(progress).toHaveText('0/36')
	await first.click()
	await expect(progress).toHaveText('1/36')
	await expect(startHighlight).toHaveCount(0)
	for (const wrong of [cell(1, 1), cell(4, 5)]) {
		await wrong.click()
		await expect(board.getByText('Tap or drag to a square next to 1')).toBeVisible()
		await expect(progress).toHaveText('1/36')
	}
	await cell(5, 4).click()
	await expect(progress).toHaveText('2/36')
	await mouseDrag(page, cell(5, 4), cell(6, 4))
	await expect(progress).toHaveText('3/36')
	await board.getByRole('button', { name: 'Start over', exact: true }).click()
	await expect(progress).toHaveText('0/36')
	await expect(startHighlight).toBeVisible()
})

const paintCell = (board: Locator, row: number, col: number) =>
	board.locator(`[data-paint-row="${row}"][data-paint-col="${col}"]`)

test('Paint applies one drag stroke, supports Undo and Start over, and toggles clue dimming', async ({
	page,
}) => {
	const board = await open(page, 'nonogram', 'easy')
	await expect(board.getByText('10×10', { exact: true })).toBeVisible()
	await expect(board.getByText('Star', { exact: true })).toHaveCount(0)
	await mouseDrag(page, paintCell(board, 2, 1), paintCell(board, 2, 3))
	await expect(board.locator('[data-filled]')).toHaveCount(3)
	await board.getByRole('button', { name: 'Undo', exact: true }).click()
	await expect(board.locator('[data-filled]')).toHaveCount(0)
	const row = board.locator('#paint-row-0')
	await row.click()
	await expect(row).toHaveAttribute('aria-pressed', 'true')
	await row.click()
	await expect(row).toHaveAttribute('aria-pressed', 'false')
	await paintCell(board, 0, 0).click()
	await expect(board.locator('[data-filled]')).toHaveCount(1)
	await board.getByRole('button', { name: 'Start over', exact: true }).click()
	await expect(board.locator('[data-filled]')).toHaveCount(0)
})

test('Paint reveals the localized theme only after the solved grid is accepted', async ({
	page,
}) => {
	await page.route('**/puzzled.v1.PuzzleService/SubmitGuess', (route) =>
		route.fulfill({ json: { gameSlug: 'nonogram', valid: true, status: 'won', score: 100 } }),
	)
	const board = await open(page, 'nonogram', 'easy', 'zh-TW')
	await expect(board.getByText('10×10', { exact: true })).toBeVisible()
	await expect(board.getByText('星星', { exact: true })).toHaveCount(0)
	const solved = nonogram.find((fixture) => fixture.difficulty === 'easy')?.solution.grid
	if (!solved) throw new Error('Missing easy Paint golden')
	for (const [row, line] of solved.entries()) {
		for (const [col, filled] of line.entries()) {
			if (filled) await paintCell(board, row, col).click()
		}
	}
	await expect(board.getByText('星星', { exact: true })).toBeVisible()
})

test('Block Slide reports a blocked drag and Undo restores the last move', async ({ page }) => {
	const board = await open(page, 'block-slide', 'easy')
	const target = board.locator('[data-block-id="target"]')
	await target.scrollIntoViewIfNeeded()
	const start = await center(target)
	await page.mouse.move(start.x, start.y)
	await page.mouse.down()
	await page.mouse.move(start.x - 55, start.y, { steps: 3 })
	await page.mouse.up()
	await expect(board.getByText(/That block cannot move in (this|that) direction/)).toBeVisible()
	await expect(board.locator('[data-move-count]')).toHaveText('0 moves')
	await expect(target).toHaveAttribute('aria-pressed', 'true')
	await page.keyboard.press('ArrowUp')
	await expect(board.locator('[data-move-count]')).toHaveText('1 move')
	await expect(target).toHaveAccessibleName(/Row 1/)
	await board.getByRole('button', { name: 'Undo', exact: true }).click()
	await expect(board.locator('[data-move-count]')).toHaveText('0 moves')
	await expect(target).toHaveAccessibleName(/Row 2/)
})

for (const viewport of [
	{ width: 1280, height: 800 },
	{ width: 390, height: 844 },
]) {
	test(`Pip Place cells are tappable and explain selection at ${viewport.width}×${viewport.height}`, async ({
		page,
	}) => {
		await page.setViewportSize(viewport)
		const board = await open(page, 'pip-place')
		const cells = board.locator('[data-pip-cell]')
		await expect(cells).toHaveCount(20)
		for (const cell of await cells.all()) {
			const box = await cell.boundingBox()
			expect(box?.height ?? 0).toBeGreaterThanOrEqual(40)
		}
		const first = board.locator('[data-pip-cell="0,0"]')
		await first.click()
		await expect(board.getByText('Select a domino below first')).toBeVisible()
		await expect(board.locator('[data-pip-tray]')).toHaveAttribute('data-highlight')
		await board.locator('[data-pip-tile="0-1"]').click()
		await first.click()
		await board.locator('[data-pip-cell="1,1"]').click()
		await expect(board.getByText('Pick an adjacent up/down/left/right square')).toBeVisible()
		await expect(first).toHaveAttribute('aria-pressed', 'true')
		await board.locator('[data-pip-cell="1,0"]').click()
		await expect(board.locator('[data-pip-tile="0-1"]')).toHaveCount(0)
		await board.locator('[data-pip-tile="0-2"]').click()
		await mouseDrag(
			page,
			board.locator('[data-pip-cell="0,1"]'),
			board.locator('[data-pip-cell="0,2"]'),
		)
		await expect(board.locator('[data-pip-tile="0-2"]')).toHaveCount(0)
	})
}

test('Sudoku explains missing selection, locked clues and duplicates', async ({ page }) => {
	const board = await open(page, 'sudoku', 'easy')
	const one = board.getByRole('button', { name: '1', exact: true })
	await one.click()
	await expect(board.getByText('Tap a blank square first')).toBeVisible()
	await board.getByRole('button', { name: /^Row 1, Column 1,/ }).click()
	await page.keyboard.press('1')
	await expect(board.getByText('That number is locked')).toBeVisible()
	await board.getByRole('button', { name: /^Row 1, Column 4(?:,|$)/ }).click()
	await page.keyboard.press('3')
	await expect(board.getByText('Duplicate number in row, column, or box')).toBeVisible()
	const conflict = board.locator('button[data-conflict]').first()
	await expect(conflict).toBeVisible()
	const startOver = board.getByRole('button', { name: 'Start over', exact: true })
	page.once('dialog', (dialog) => dialog.dismiss())
	await startOver.click()
	await expect(conflict).toBeVisible()
	page.once('dialog', (dialog) => dialog.accept())
	await startOver.click()
	await expect(conflict).toHaveCount(0)
})

test('Ladder focuses the input from the rung and prioritizes the length hint', async ({ page }) => {
	const board = await open(page, 'word-ladder')
	const input = board.getByRole('textbox')
	await board.locator('[data-ladder-path]').getByText('d', { exact: true }).click()
	await expect(input).toBeFocused()
	await input.fill('x')
	await input.press('Enter')
	await expect(board.getByText(/^Enter a 4-letter word/)).toBeVisible()
})

test('Match says cards can be reused in different valid trios', async ({ page }) => {
	await page.goto('/en-US/games/pattern-match')
	await expect(page.getByText(/more than one valid trio/i)).toBeVisible()
	await expect(page.getByText(/cards.*are locked/i)).toHaveCount(0)
})

test('Hive physical Enter submits instead of repeating a pointer-clicked control', async ({
	page,
}) => {
	const board = await open(page, 'word-hive')
	const draft = board.locator('[data-hive-draft]')
	await board.locator('button[data-letter]').first().click()
	const letter = (await draft.textContent())?.trim() ?? ''
	expect(letter).toMatch(/^[A-Z]$/)
	await page.keyboard.press('Enter')
	await expect(board.getByText('Too short (min 4 letters)')).toBeVisible()
	await expect(draft).toHaveText(letter)
	await board.getByRole('button', { name: 'Shuffle', exact: true }).click()
	await page.keyboard.press('Enter')
	await expect(board.getByText('Too short (min 4 letters)')).toBeVisible()
	await expect(draft).toHaveText(letter)
	await board.getByRole('button', { name: 'Delete', exact: true }).click()
	await page.keyboard.press('Enter')
	await expect(board.getByText('Too short (min 4 letters)')).toBeVisible()
	await page.keyboard.press('z')
	await expect(board.getByText('Letter not in hive')).toBeVisible()
})

test.describe('phone touch input', () => {
	test.use({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true })

	test('Paint marks every cell crossed by a finger', async ({ page }) => {
		const board = await open(page, 'nonogram', 'easy')
		await board.getByRole('button', { name: 'Mark', exact: true }).tap()
		await touchDrag(page, paintCell(board, 3, 1), paintCell(board, 3, 4))
		await expect(board.locator('[data-marked]')).toHaveCount(4)
	})

	test('Path starts a drag on clue 1 without losing touch pointer capture', async ({ page }) => {
		const board = await open(page, 'number-path')
		await touchDrag(
			page,
			board.getByRole('button', { name: /^Row 4, Column 4,/ }),
			board.getByRole('button', { name: /^Row 6, Column 4(?:,|$)/ }),
		)
		await expect(board.locator('output')).toHaveText('3/36')
	})

	test('Hunt explains a non-word and Reset works on the first tap after a drag', async ({
		page,
	}) => {
		const board = await open(page, 'word-search')
		const cell = (row: number, col: number) =>
			board.locator(`button[data-row="${row}"][data-col="${col}"]`)
		const progress = board.locator('output')
		await touchDrag(page, cell(0, 0), cell(0, 2))
		await expect(board.getByText(/doesn.t match a word on the list/i)).toBeVisible()
		await cell(0, 0).tap()
		await cell(0, 2).tap()
		await expect(board.getByText(/doesn.t match a word on the list/i)).toBeVisible()
		await touchDrag(page, cell(1, 4), cell(1, 9)) // MELODY
		await expect(progress).toHaveText('1/8')
		await board.getByRole('button', { name: 'Start over', exact: true }).tap()
		await expect(progress).toHaveText('0/8')
		await expect(board.locator('[data-found]')).toHaveCount(0)
	})
})
