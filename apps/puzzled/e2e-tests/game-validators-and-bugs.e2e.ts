import { expect, type Page, test } from '@playwright/test'
import frameFixtures from '../../../crates/puzzled-core/tests/fixtures/generate/word-box.json'
import { productDayKey } from '../src/lib/product-day'

const service = '**/puzzled.v1.PuzzleService/'

async function play(page: Page, slug: string, data: unknown, locale = 'en-US', difficulty = '') {
	const daily = { gameSlug: slug, puzzleDate: productDayKey(), canPlay: true, difficulty }
	await page.route('**/v1/guest/session', (route) => route.fulfill({ json: { issued: true } }))
	await page.route(`${service}GetDaily`, (route) =>
		route.fulfill({ json: { ...daily, requiresStart: true } }),
	)
	await page.route(`${service}StartDaily`, (route) =>
		route.fulfill({ json: { daily: { ...daily, puzzleDataJson: JSON.stringify(data) } } }),
	)
	await page.goto(
		'/' +
			locale +
			'/games/' +
			slug +
			'?start=1' +
			(difficulty ? `&difficulty=${difficulty}` : '') +
			'#play',
	)
	const decline = page.getByRole('button', { name: /^(Decline|拒絕)$/ })
	if (await decline.isVisible()) await decline.click()
	await page.locator('[data-game-stage="start"]').getByRole('button').click()
	await expect(page.locator('[data-game-stage="board"]')).toBeVisible()
}

for (const viewport of [
	{ width: 1440, height: 900 },
	{ width: 390, height: 844 },
]) {
	for (const colorScheme of ['light', 'dark'] as const) {
		test(`Duo highlights identical full rows before the board is full (${viewport.width}×${viewport.height}, ${colorScheme})`, async ({
			page,
		}) => {
			await page.setViewportSize(viewport)
			await page.emulateMedia({ colorScheme })
			const line = ['sun', 'moon', 'sun', 'moon', 'sun', 'moon']
			const initialGrid = Array.from({ length: 6 }, () => Array(6).fill(null))
			initialGrid[0] = line
			initialGrid[2] = [...line.slice(0, -1), null]
			const mobile = viewport.width === 390
			await play(page, 'duo', { size: 6, initialGrid }, mobile ? 'zh-HK' : 'en-US')
			await expect(page.locator('html')).toHaveCSS('color-scheme', colorScheme)
			const board = page.locator('[data-game-stage="board"]')
			const cells = board.locator('fieldset button')
			const last = cells.nth(17)
			const invalid = board.locator('fieldset button[data-invalid="true"][aria-invalid="true"]')
			const status = board
				.getByRole('status')
				.getByText(
					mobile
						? '第 1及3 行的排列一樣，每行的排列都要不同。'
						: 'Rows 1 and 3 are identical. Every row must be unique.',
					{ exact: true },
				)
			await expect(cells).toHaveCount(36)
			await expect(invalid).toHaveCount(0)
			await expect(status).toHaveCount(0)

			await last.click() // A fourth sun breaks balance, but the rows still differ.
			await expect(invalid).toHaveCount(6)
			await expect(status).toHaveCount(0)
			await last.click() // Moon: row 3 now matches row 1.
			await expect(status).toBeVisible()
			await expect(invalid).toHaveCount(12)
			const red = colorScheme === 'dark' ? 'rgb(242, 123, 112)' : 'rgb(168, 43, 35)'
			for (const index of [0, 1, 2, 3, 4, 5, 12, 13, 14, 15, 16, 17]) {
				const cell = cells.nth(index)
				await expect(cell).toHaveAttribute('data-invalid', 'true')
				await expect(cell).toHaveAttribute('aria-invalid', 'true')
				await expect(cell).toHaveCSS('border-top-color', red)
				const shadow = await cell.evaluate((element) => getComputedStyle(element).boxShadow)
				expect(shadow).toContain(`${red} 0px 0px 0px 2px inset`)
			}
			await expect(board.getByText(/Some cells violate the rules|有格子違反規則/)).toHaveCount(0)

			await last.press('Backspace')
			await expect(invalid).toHaveCount(0)
			await expect(status).toHaveCount(0)
		})
	}
}

for (const [locale, error] of [
	['en-US', 'Not in word list'],
	['zh-HK', '不在詞庫中'],
] as const) {
	test(`Frame rejects a legal-looking non-word and adds a dictionary word (${locale})`, async ({
		page,
	}) => {
		const { puzzleData } = frameFixtures[0]
		let submitted = 0
		await page.route(`${service}SubmitGuess`, (route) => {
			submitted++
			return route.fulfill({
				json: { valid: false, gameSlug: 'word-box', error: 'Unexpected finish' },
			})
		})
		await play(page, 'word-box', puzzleData, locale)
		const board = page.locator('[data-word-box-board]')
		const draft = board.locator('input')
		const add = board.locator('button[type="submit"]')
		await expect(add).toBeDisabled()
		await expect(add).toHaveCSS('opacity', '0.5')
		// Cycles through all four sides, covers every letter, and isn't a word.
		await page.keyboard.type('NBCAROULFGMH')
		await expect(draft).toHaveValue('NBCAROULFGMH')
		await page.keyboard.press('Enter')
		await expect(board.getByRole('status').filter({ hasText: error })).toBeVisible()
		await expect(board.locator('ol')).toHaveCount(0)
		expect(submitted).toBe(0)
		for (let i = 0; i < 12; i++) await page.keyboard.press('Backspace')
		await page.keyboard.type('BACH')
		// Use physical Enter while a letter button still has pointer focus.
		await page.keyboard.press('Backspace')
		const letter = board.locator('[data-box-letter="H"]')
		await letter.click()
		await expect(letter).toBeFocused()
		await page.keyboard.press('Enter')
		await expect(board.locator('ol li')).toHaveText('BACH')
	})
}

for (const [locale, resetCopy, confirmCopy] of [
	['en-US', 'Start over', 'Confirm reset?'],
	['zh-TW', '重新開始', '確定要重新開始嗎？'],
] as const) {
	test(
		'Frame protects the word chain from an accidental reset (' + locale + ')',
		async ({ page }) => {
			await play(page, 'word-box', frameFixtures[0].puzzleData, locale)
			const board = page.locator('[data-word-box-board]')
			const input = board.locator('input')
			const reset = board.getByRole('button', { name: resetCopy, exact: true })
			const confirm = board.getByRole('button', { name: confirmCopy, exact: true })
			const chain = board.locator('ol li')
			// Empty boards need no confirmation and retain the type-and-submit path.
			await reset.click()
			await expect(input).toBeFocused()
			await expect(confirm).toHaveCount(0)
			await page.keyboard.type('BACH')
			await page.keyboard.press('Enter')
			await expect(chain).toHaveText('BACH')
			await reset.focus()
			await page.keyboard.down('Enter')
			await expect(confirm).toBeFocused()
			await expect(confirm.locator('[aria-live="polite"]')).toHaveText(confirmCopy)
			await expect(chain).toHaveText('BACH')
			// Holding Enter cannot confirm both steps.
			await page.keyboard.down('Enter')
			await expect(confirm).toBeFocused()
			await expect(chain).toHaveText('BACH')
			await page.keyboard.up('Enter')
			await confirm.press('Enter')
			await expect(chain).toHaveCount(0)
			await expect(input).toBeFocused()
			await page.keyboard.type('BACH')
			await page.keyboard.press('Enter')
			await expect(chain).toHaveText('BACH')
			await reset.click()
			await page.keyboard.press('Escape')
			await expect(reset).toBeFocused()
			await expect(chain).toHaveText('BACH')
			await reset.click()
			await input.focus()
			await expect(reset).toBeVisible()
			await expect(chain).toHaveText('BACH')
			await reset.click()
			await confirm.click()
			await expect(chain).toHaveCount(0)
			await expect(input).toBeFocused()
			await page.keyboard.type('BACH')
			await page.keyboard.press('Enter')
			await expect(chain).toHaveText('BACH')
		},
	)
}

test('Quad shows a dictionary error in the mobile viewport without using a guess', async ({
	page,
}) => {
	await page.setViewportSize({ width: 390, height: 844 })
	const graded: string[] = []
	const gradeResponse = Promise.withResolvers<void>()
	await page.route(`${service}CheckGuess`, async (route) => {
		graded.push(JSON.parse(route.request().postDataJSON().guessJson).word)
		await gradeResponse.promise
		await route.fulfill({
			json: {
				resultJson: JSON.stringify({
					boards: Array.from({ length: 4 }, () => Array(5).fill('absent')),
				}),
			},
		})
	})
	await play(page, 'quad-words', { wordLength: 5, maxGuesses: 9 })
	const board = page.locator('[data-quad-board]')
	const attempts = board.getByRole('status').filter({ hasText: 'Attempts' })
	try {
		await page.keyboard.type('ZZZZZ')
		await page.keyboard.press('Enter')
		const error = board.getByRole('alert')
		await expect(error).toHaveText('Not in word list')
		await expect(error).toBeInViewport({ ratio: 1 })
		await expect(attempts).toContainText('0/9')
		await expect(board.locator('td[data-grade]')).toHaveCount(0)
		expect(graded).toEqual([])
		for (let i = 0; i < 5; i++) await page.keyboard.press('Backspace')
		await page.keyboard.type('CRANE')
		await page.keyboard.press('Enter')
		await expect(board.getByRole('status').filter({ hasText: 'Syncing' })).toBeVisible()
		await expect(attempts).toContainText('0/9')
	} finally {
		gradeResponse.resolve()
	}
	await expect(attempts).toContainText('1/9')
	expect(graded).toEqual(['CRANE'])
})

test('Crossword types immediately, switches clues live, and marks only rejected cells', async ({
	page,
}) => {
	const clues = {
		across: [{ number: 1, row: 0, col: 0, length: 2, clue: 'Across hint' }],
		down: [{ number: 1, row: 0, col: 0, length: 2, clue: 'Down hint' }],
	}
	const black = Array(5).fill(null)
	let submitted = 0
	await page.route(`${service}SubmitGuess`, (route) => {
		submitted++
		const grid = JSON.parse(route.request().postDataJSON().submissionJson).finalGrid
		expect(grid.slice(0, 2)).toEqual([
			['A', 'B', null, null, null],
			['C', null, null, null, null],
		])
		return route.fulfill({
			json: { valid: false, gameSlug: 'crossword', error: 'crossword_incorrect_cells:2' },
		})
	})
	await play(page, 'crossword', {
		clues,
		grid: [['', '', null, null, null], ['', null, null, null, null], black, black, black],
	})
	const board = page.locator('[data-crossword-board]')
	const first = board.locator('[data-crossword-cell="0,0"]')
	const second = board.locator('[data-crossword-cell="0,1"]')
	const third = board.locator('[data-crossword-cell="1,0"]')
	const banner = board.getByRole('status')
	const check = board.getByRole('button', { name: 'Check', exact: true })
	await expect(banner).toHaveText('1 Across: Across hint')
	await expect(first).toHaveAttribute('aria-pressed', 'true')
	const colors = await first.evaluate((cell) => {
		const reference = document.createElement('span')
		reference.className = 'bg-primary text-primary-foreground'
		cell.append(reference)
		const expected = [
			getComputedStyle(reference).backgroundColor,
			getComputedStyle(reference).color,
		]
		reference.remove()
		return {
			actual: [getComputedStyle(cell).backgroundColor, getComputedStyle(cell).color],
			expected,
		}
	})
	expect(colors.actual).toEqual(colors.expected)
	await page.keyboard.press('a')
	await expect(first).toHaveAccessibleName(/, A$/)
	await check.click()
	await expect(board.getByRole('alert')).toHaveText('Fill every square before checking.')
	expect(submitted).toBe(0)
	await first.dblclick()
	await expect(banner).toHaveText('1 Down: Down hint')
	await expect(third).toHaveAttribute('data-word', 'true')
	await board.getByText('Clues', { exact: true }).click()
	await board.getByRole('button', { name: '1. Across hint' }).click()
	await expect(banner).toHaveText('1 Across: Across hint')
	await page.keyboard.type('AB')
	await board.getByRole('button', { name: '1. Down hint' }).click()
	await expect(banner).toHaveText('1 Down: Down hint')
	await page.keyboard.type('AC')
	await check.click()
	await expect(board.getByRole('alert')).toHaveText('Try again')
	await expect(second).toHaveAttribute('aria-invalid', 'true')
	await expect(second).not.toHaveCSS('box-shadow', 'none')
	await expect(board.locator('[aria-invalid="true"]')).toHaveCount(1)
	await expect(board.getByText('✓', { exact: true })).toHaveCount(0)
})

test('Killer Sudoku flags a wrong total, protects digits in Notes, and can undo a reset', async ({
	page,
}) => {
	const grid = Array.from({ length: 9 }, (_, r) =>
		Array.from({ length: 9 }, (_, c) => (r === 8 && c === 8 ? 9 : null)),
	)
	const cages = [
		{
			cells: [
				[0, 0],
				[0, 1],
			],
			sum: 9,
		},
	]
	for (let i = 2; i < 81; i++) cages.push({ cells: [[Math.floor(i / 9), i % 9]], sum: 9 })
	await play(page, 'killer-sudoku', { grid, cages }, 'en-US', 'easy')
	const board = page.locator('[data-killer-sudoku-board]')
	const status = board.getByRole('status')
	const digit = (n: number) => board.getByRole('button', { name: String(n), exact: true })
	const first = board.getByRole('button', { name: /Row 1, Column 1,/ })
	const second = board.getByRole('button', { name: /Row 1, Column 2,/ })
	await digit(3).click()
	await expect(status).toHaveText('Tap a blank square first')
	await board.locator('button[data-given]').click()
	await digit(3).click()
	await expect(status).toHaveText('Locked clue')
	await first.click()
	await page.keyboard.press('3')
	await expect(first).not.toHaveAttribute('aria-invalid')
	await second.click()
	await digit(2).click()
	await expect(first).toHaveAttribute('aria-invalid', 'true')
	await expect(second).toHaveAttribute('aria-invalid', 'true')
	await expect(status).toHaveText('This cage must add up to 9.')
	const notes = board.getByRole('button', { name: 'Notes', exact: true })
	await notes.click()
	await digit(4).click()
	await expect(second).toHaveAccessibleName(/, 2, Cage total 9/)
	await expect(status).toContainText('Clear the digit before adding notes.')
	await notes.click()
	await digit(6).click()
	await expect(first).not.toHaveAttribute('aria-invalid')
	await board.getByRole('button', { name: 'Start over' }).click()
	await expect(first).not.toHaveAttribute('data-filled')
	await board.getByRole('button', { name: 'Undo' }).click()
	await expect(first).toHaveAccessibleName(/, 3, Cage total 9/)
	await expect(second).toHaveAccessibleName(/, 6, Cage total 9/)
})

test('Arithmo explains tile taps and physical Enter submits with a keypad digit focused', async ({
	page,
}) => {
	const guesses: string[] = []
	await page.route(`${service}CheckGuess`, async (route) => {
		guesses.push(JSON.parse(route.request().postDataJSON().guessJson).equation)
		await route.fulfill({
			json: { resultJson: JSON.stringify({ tiles: Array(8).fill('absent') }) },
		})
	})
	await play(page, 'arithmo', { length: 8 })
	const board = page.locator('[data-arithmo-board]')
	await board.locator('[data-arithmo-grid] [data-grade]').first().click()
	await expect(board.getByRole('status')).toHaveText('Entries fill from left to right.')
	const one = board.getByRole('button', { name: '1', exact: true })
	await one.click()
	await page.keyboard.press('Enter')
	await expect(board.getByRole('alert')).toHaveText('Not enough characters')
	await expect(
		board.locator('[data-arithmo-grid] li').first().locator('[data-grade]').nth(1),
	).toBeEmpty()
	await page.keyboard.type('2+34=46')
	await expect(one).toBeFocused()
	await page.keyboard.press('Enter')
	await expect(board.locator('[data-arithmo-grid] [data-grade="absent"]')).toHaveCount(8)
	expect(guesses).toEqual(['12+34=46'])
})
