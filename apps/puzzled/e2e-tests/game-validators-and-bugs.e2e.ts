import AxeBuilder from '@axe-core/playwright'
import { expect, type Page, test } from '@playwright/test'
import frameFixtures from '../../../crates/puzzled-core/tests/fixtures/generate/word-box.json'
import { productDayKey } from '../src/lib/product-day'
import { DAILY_PLAY_DRAFT_PREFIX } from '../src/lib/storage-keys'

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

test.describe('Path recovery on touch', () => {
	test.use({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true })

	test('offers Undo immediately when only rewinds or wrong clues remain', async ({ page }) => {
		await play(page, 'number-path', {
			size: 3,
			clues: [
				[1, null, 4],
				[null, 5, null],
				[null, null, 9],
			],
		})
		const board = page.locator('[data-number-path-board]')
		const status = board.locator('.play-tools').getByRole('status')
		const progress = board.locator('output')
		const start = board.getByRole('button', { name: /^Row 1, Column 1,/ })
		const blank = board.getByRole('button', { name: /^Row 1, Column 2(?:,|$)/ })
		const undo = board.getByRole('button', { name: 'Undo', exact: true })
		const cue = 'No moves from here. Use Undo to back up.'
		const enterDeadEnd = async () => {
			await blank.tap()
			await expect(progress).toHaveText('2/9')
			await expect(status).toHaveText(cue)
		}

		await expect(status).toBeEmpty()
		await expect(undo).toBeDisabled()
		await start.tap()
		await expect(progress).toHaveText('1/9')
		await expect(status).toHaveText('Step 2: choose a blank next to 1.')
		await enterDeadEnd()
		await undo.tap()
		await expect(progress).toHaveText('1/9')
		await expect(status).toHaveText('Step 2: choose a blank next to 1.')

		await enterDeadEnd()
		await start.tap()
		await expect(progress).toHaveText('1/9')
		await expect(status).toHaveText('Step 2: choose a blank next to 1.')

		await enterDeadEnd()
		await board.getByRole('button', { name: 'Start over', exact: true }).tap()
		await expect(progress).toHaveText('0/9')
		await expect(status).toBeEmpty()
		await expect(undo).toBeDisabled()
	})
})

for (const phone of [true, false]) {
	test.describe(phone ? 'Path phone' : 'Path desktop', () => {
		test.use({
			viewport: phone ? { width: 390, height: 844 } : { width: 1440, height: 900 },
			isMobile: phone,
			hasTouch: phone,
		})

		test('keeps locked numbers unique through Undo, old drafts, and a guest finish', async ({
			page,
			baseURL,
		}, info) => {
			const origin = new URL(baseURL ?? 'http://localhost:3000')
			expect(['localhost', '127.0.0.1']).toContain(origin.hostname)
			const [one, badTwo, offClue] = [
				{ row: 1, col: 2 },
				{ row: 2, col: 2 },
				{ row: 2, col: 3 },
			]
			const legal = [6, 7, 3, 2, 1, 0, 4, 5, 9, 8, 12, 13, 14, 10, 11, 15].map((i) => ({
				row: Math.floor(i / 4),
				col: i % 4,
			}))
			const daily = {
				gameSlug: 'number-path',
				puzzleDate: productDayKey(),
				canPlay: true,
				puzzleId: '11a198bc-8079-4830-8c07-0d397aaabc73',
				puzzleDataJson: JSON.stringify({
					size: 4,
					clues: [
						[null, 5, null, 3],
						[null, null, 1, null],
						[null, null, null, null],
						[null, null, null, 16],
					],
				}),
			}
			await page.route('**/v1/guest/session', (route) =>
				route.fulfill({
					json: { issued: true },
					headers: {
						'Set-Cookie': '__Host-puzzled_guest=path-draft-fixture; Secure; HttpOnly; Path=/',
					},
				}),
			)
			await page.route(/\/(?:StartDaily|CheckGuess|SubmitGuess)$/, (route) => route.abort())
			let started = false
			await page.route(`${service}GetDaily`, (route) =>
				route.fulfill({
					json: started ? daily : { ...daily, puzzleDataJson: undefined, requiresStart: true },
				}),
			)
			await page.route(`${service}StartDaily`, (route) => {
				started = true
				return route.fulfill({ json: { daily } })
			})
			let submissions = 0
			await page.route(`${service}SubmitGuess`, (route) => {
				submissions++
				const body = route.request().postDataJSON()
				expect(body).toMatchObject({ status: 'won', puzzleId: daily.puzzleId })
				expect(JSON.parse(body.submissionJson)).toEqual({ path: legal })
				return route.fulfill({ json: { gameSlug: daily.gameSlug, valid: true, status: 'won' } })
			})
			await page.goto('/en-US/games/number-path?start=1#play')
			const decline = page.getByRole('button', { name: 'Decline', exact: true })
			if (await decline.isVisible()) await decline.click()
			await page.locator('[data-game-stage="start"]').getByRole('button').click()
			const board = page.locator('[data-number-path-board]')
			const status = board.locator('.play-tools').getByRole('status')
			const progress = board.locator('output')
			const cells = board.locator('fieldset button')
			const cell = ({ row, col }: { row: number; col: number }) => cells.nth(row * 4 + col)
			const undo = board.getByRole('button', { name: 'Undo', exact: true })
			const activate = (button: ReturnType<typeof cell>) => (phone ? button.tap() : button.click())
			const warning = 'Clue 3 isn’t adjacent. Undo the last step.'
			await activate(cell(one))
			await expect(status).toHaveText('Step 2: choose a blank next to 1.')
			if (phone) await cell(badTwo).tap()
			else {
				await cell(one).press('ArrowDown')
				await expect(cell(badTwo)).toBeFocused()
				await page.keyboard.press('Enter')
			}
			await expect(status).toBeInViewport({ ratio: 1 })
			await expect(status).toHaveText(warning)
			await expect(progress).toHaveText('2/16')
			await page.screenshot({ path: info.outputPath('path-unreachable.png') })
			await activate(cell(offClue))
			await expect(progress).toHaveText('2/16')
			await expect(cell(offClue)).toBeEmpty()
			await expect(status).toHaveText(warning)

			// Seed a legacy continuation just before hydration; pagehide can still save the current draft.
			await page.addInitScript(
				({ prefix, oldPath }) => {
					const key = Object.keys(sessionStorage).find((key) => key.startsWith(prefix))
					if (!key || sessionStorage.getItem('old-path-seeded')) return
					sessionStorage.setItem(
						key,
						JSON.stringify({ elapsedMs: 6000, fields: { path: oldPath } }),
					)
					sessionStorage.setItem('old-path-seeded', 'yes')
				},
				{ prefix: DAILY_PLAY_DRAFT_PREFIX, oldPath: [one, badTwo, offClue] },
			)
			await page.reload()
			expect(await page.evaluate(() => sessionStorage.getItem('old-path-seeded'))).toBe('yes')
			await expect(progress).toHaveText('2/16')
			await expect(cell(offClue)).toBeEmpty()
			await expect(status).toHaveText(warning)
			await activate(undo)
			await expect(progress).toHaveText('1/16')
			await activate(cell(legal[1]))
			await expect(status).toHaveText('Step 3: use its locked tile.')
			await expect(cell(legal[2]).locator('[data-next-clue]')).toHaveCSS('outline-style', 'solid')
			await page.screenshot({ path: info.outputPath('path-locked-next.png') })
			await activate(cell(offClue))
			await expect(status).toHaveText('Step 3 can only go on its locked tile.')
			await expect(progress).toHaveText('2/16')
			await expect(cell(offClue)).toBeEmpty()
			await page.reload()
			await expect(progress).toHaveText('2/16')
			await expect(cell(legal[1])).toHaveText('2')
			await expect(status).toHaveText('Step 3: use its locked tile.')
			await activate(cell(one))
			await expect(progress).toHaveText('1/16')
			expect(submissions).toBe(0)
			for (const step of legal.slice(1)) await activate(cell(step))
			await expect(page.locator('[data-board-finished]')).toBeVisible()
			expect(submissions).toBe(1)
		})
	})
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
		const key = (value: string) => board.locator(`[data-key="${value}"]`)
		for (const letter of 'ZZZZZ') await key(letter).click()
		await key('Enter').click()
		const error = board.getByRole('alert')
		await expect(error).toHaveText('Not in word list')
		await expect(error).toBeInViewport({ ratio: 1 })
		await expect(attempts).toContainText('0/9')
		await expect(board.locator('td[data-grade]')).toHaveCount(0)
		expect(graded).toEqual([])
		for (let i = 0; i < 5; i++) await key('Backspace').click()
		for (const letter of 'CRANE') await key(letter).click()
		await key('Enter').click()
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
	const progress = board.locator('.play-meta')
	const cluesToggle = board.locator('.crossword-clues > summary')
	await expect(banner).toHaveText('1 Across: Across hint')
	await expect(progress).toBeVisible()
	await expect(progress.locator('span')).toHaveText(['0 / 3', 'Across'])
	await expect(first).toHaveAttribute('aria-pressed', 'true')
	await expect(first).toHaveCSS('background-color', 'rgb(244, 180, 42)')
	await expect(first).toHaveCSS('color', 'rgb(26, 23, 18)')
	await expect(second).toHaveCSS('background-color', 'rgb(252, 240, 210)')
	await check.scrollIntoViewIfNeeded()
	const beforeIncomplete = await cluesToggle.boundingBox()
	await check.click()
	await expect(board.getByRole('alert')).toHaveText('Fill every square before checking.')
	expect(await cluesToggle.boundingBox()).toEqual(beforeIncomplete)
	expect(submitted).toBe(0)
	await page.keyboard.press('a')
	await expect(first).toHaveAccessibleName(/, A$/)
	await expect(progress.locator('span')).toHaveText(['1 / 3', 'Across'])
	await first.dblclick()
	await expect(banner).toHaveText('1 Down: Down hint')
	await expect(third).toHaveAttribute('data-word', 'true')
	await expect(progress.locator('span')).toHaveText(['1 / 3', 'Down'])
	await cluesToggle.click()
	await expect(board.getByRole('button', { name: '1. Down hint' })).toHaveAttribute(
		'aria-current',
		'true',
	)
	await expect(board.getByRole('button', { name: '1. Down hint' })).toHaveCSS(
		'background-color',
		'rgb(252, 240, 210)',
	)
	await board.getByRole('button', { name: '1. Across hint' }).click()
	await expect(banner).toHaveText('1 Across: Across hint')
	await page.keyboard.type('AB')
	await board.getByRole('button', { name: '1. Down hint' }).click()
	await expect(banner).toHaveText('1 Down: Down hint')
	await page.keyboard.type('AC')
	await expect(progress.locator('span')).toHaveText(['3 / 3', 'Down'])
	await check.scrollIntoViewIfNeeded()
	const beforeIncorrect = await cluesToggle.boundingBox()
	await check.click()
	await expect(board.getByRole('alert')).toHaveText('Try again')
	expect(await cluesToggle.boundingBox()).toEqual(beforeIncorrect)
	await expect(second).toHaveAttribute('aria-invalid', 'true')
	await expect(second).toHaveCSS('box-shadow', 'rgb(168, 43, 35) 0px 0px 0px 3px inset')
	await second.click()
	await expect(second).toHaveAttribute('aria-pressed', 'true')
	await expect(second).toHaveCSS('background-color', 'rgb(244, 180, 42)')
	await expect(second).toHaveCSS('box-shadow', /rgb\(168, 43, 35\) 0px 0px 0px 3px inset/)
	await expect(board.locator('[aria-invalid="true"]')).toHaveCount(1)
	await expect(board.getByText('✓', { exact: true })).toHaveCount(0)
})

const navigationGrid = [
	['', '', null, null, null],
	['', null, null, null, null],
	...Array.from({ length: 3 }, () => [null, null, null, null, null]),
]
const navigationAcross = { number: 1, row: 0, col: 0, length: 2, clue: 'First row' }
const navigationDown = {
	number: 1,
	row: 0,
	col: 0,
	length: 2,
	clue: 'A deliberately long clue that wraps without pushing either of the navigation buttons out of the clue bar',
}

for (const viewport of [
	{ width: 390, height: 844 },
	{ width: 1440, height: 900 },
]) {
	const touch = viewport.width === 390
	test.describe(`Mini Grid clue bar at ${viewport.width}×${viewport.height}`, () => {
		test.use({ viewport, hasTouch: touch, colorScheme: touch ? 'dark' : 'light' })

		test('wraps, resumes on the next empty cell, and leaves native Tab navigation intact', async ({
			page,
		}) => {
			await play(page, 'crossword', {
				grid: navigationGrid,
				clues: { across: [navigationAcross], down: [navigationDown] },
			})
			const board = page.locator('[data-crossword-board]')
			const bar = board.locator('[data-crossword-clue-bar]')
			const status = bar.getByRole('status')
			const previous = bar.getByRole('button', { name: 'Previous clue' })
			const next = bar.getByRole('button', { name: 'Next clue' })
			const toggle = bar.getByRole('button', { name: /Switch direction$/ })
			const first = board.locator('[data-crossword-cell="0,0"]')
			const third = board.locator('[data-crossword-cell="1,0"]')
			await expect(status).toHaveText('1 Across: First row')
			await first.focus()
			await page.keyboard.press('a')
			await expect(first).toHaveAccessibleName(/, A$/)
			if (touch) await previous.tap()
			else await previous.click()
			await expect(status).toHaveText(`1 Down: ${navigationDown.clue}`)
			await expect(third).toBeFocused()
			await expect(third).toHaveAttribute('aria-pressed', 'true')
			for (const button of [previous, next]) {
				const box = await button.boundingBox()
				expect(box?.width).toBeGreaterThanOrEqual(44)
				expect(box?.height).toBeGreaterThanOrEqual(44)
			}
			for (const element of [bar, page.locator('html')]) {
				expect(await element.evaluate((el) => el.scrollWidth - el.clientWidth)).toBe(0)
			}
			const scan = await new AxeBuilder({ page })
				.include('[data-crossword-clue-bar]')
				.withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22a', 'wcag22aa'])
				.analyze()
			expect(scan.violations).toEqual([])

			if (touch) await next.tap()
			else await next.click()
			await expect(status).toHaveText('1 Across: First row')
			const second = board.locator('[data-crossword-cell="0,1"]')
			await expect(second).toBeFocused()
			await page.keyboard.press('ArrowLeft')
			await expect(first).toBeFocused()
			if (touch) await toggle.tap()
			else await toggle.click()
			await expect(status).toContainText('1 Down:')
			await expect(first).toBeFocused()
			await page.keyboard.press('ArrowRight')
			await expect(second).toBeFocused()
			await expect(status).toHaveText('1 Across: First row')
			await page.keyboard.press('Tab')
			await expect(previous).toBeFocused()
			await page.keyboard.press('Enter')
			await expect(status).toContainText('1 Down:')
			await expect(previous).toBeFocused()
			await page.keyboard.press('Shift+Tab')
			await expect(third).toBeFocused()
			for (const control of [previous, toggle, next]) {
				await page.keyboard.press('Tab')
				await expect(control).toBeFocused()
			}
			await page.keyboard.press('Space')
			await expect(status).toHaveText('1 Across: First row')
			await expect(next).toBeFocused()
			await page.keyboard.press('Tab')
			await expect(board.getByRole('button', { name: 'Q', exact: true })).toBeFocused()
			for (let i = 0; i < 27; i++) await page.keyboard.press('Tab')
			await expect(board.getByRole('button', { name: 'Check', exact: true })).toBeFocused()
			await page.keyboard.press('Tab')
			await expect(board.locator('summary')).toBeFocused()
		})
	})
}

test('Mini Grid keeps the clue visible and disables navigation on a single-clue archive grid', async ({
	page,
}) => {
	await play(page, 'crossword', {
		grid: navigationGrid,
		clues: { across: [navigationAcross], down: [] },
	})
	const bar = page.locator('[data-crossword-clue-bar]')
	await expect(page.locator('[data-crossword-board] .play-meta')).toHaveText('Across clues today')
	await expect(bar.getByRole('status')).toHaveText('1 Across: First row')
	await expect(bar.getByRole('button', { name: 'Previous clue' })).toBeDisabled()
	await expect(bar.getByRole('button', { name: 'Next clue' })).toBeDisabled()
	await expect(bar.getByRole('button', { name: /Switch direction/ })).toHaveCount(0)
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

for (const viewport of [
	{ width: 1440, height: 900 },
	{ width: 390, height: 844 },
]) {
	for (const colorScheme of ['light', 'dark'] as const) {
		test(`Spots explains a violated region before and after the last placement (${viewport.width}×${viewport.height}, ${colorScheme})`, async ({
			page,
		}) => {
			await page.setViewportSize(viewport)
			await page.emulateMedia({ colorScheme })
			const mobile = viewport.width === 390
			await play(
				page,
				'pip-place',
				{
					maxPip: 1,
					rows: 2,
					cols: 3,
					regionOf: [
						[0, 0, 1],
						[1, 1, 1],
					],
					regions: [
						{ id: 0, kind: 'sum', value: 1 },
						{ id: 1, kind: 'free', value: null },
					],
				},
				mobile ? 'zh-HK' : 'en-US',
			)
			await expect(page.locator('html')).toHaveCSS('color-scheme', colorScheme)
			const board = page.locator('[data-pip-place-board]')
			const cell = (row: number, col: number) => board.locator(`[data-pip-cell="${row},${col}"]`)
			const tray = board.locator('[data-pip-tile]')
			async function place(tile: string, col: number) {
				await board.locator(`[data-pip-tile="${tile}"]`).click()
				await cell(0, col).click()
				await cell(1, col).click()
			}
			const invalid = board.locator('[data-pip-cell][data-invalid], [data-pip-cell][aria-invalid]')
			const reason = board
				.getByRole('status')
				.getByText(
					mobile ? '區域 1 而家加埋係 0 點，應該係 1 點。' : 'Region 1 adds up to 0, needs 1.',
					{ exact: true },
				)
			const guidance = board
				.getByRole('status')
				.getByText(mobile ? '拎起一塊骨牌再調整。' : 'Pick up a tile to fix it.', { exact: true })
			const badge = cell(0, 0).getByText('1 !', { exact: true })
			await expect(board.locator('[data-pip-cell]')).toHaveCount(6)
			await place('0-0', 0) // Covers just one of the region's two cells.
			await expect(tray).toHaveCount(2)
			await expect(invalid).toHaveCount(0)
			await expect(reason).toHaveCount(0)

			await place('0-1', 1) // Both top pips are zero; the region now fails.
			await expect(tray).toHaveCount(1)
			await expect(reason).toBeVisible()
			await expect(guidance).toHaveCount(0)
			await expect(invalid).toHaveCount(2)
			const red = colorScheme === 'dark' ? 'rgb(242, 123, 112)' : 'rgb(168, 43, 35)'
			await expect(badge).toBeVisible()
			await expect(badge).toHaveCSS('background-color', red)
			for (const col of [0, 1]) {
				const invalidCell = cell(0, col)
				await expect(invalidCell).toHaveAttribute('data-invalid', 'true')
				await expect(invalidCell).toHaveAttribute('aria-invalid', 'true')
				await expect(invalidCell).toHaveCSS('border-top-color', red)
				const shadow = await invalidCell.evaluate((element) => getComputedStyle(element).boxShadow)
				expect(shadow).toContain(`${red} 0px 0px 0px 2px inset`)
			}

			await place('1-1', 2)
			await expect(tray).toHaveCount(0)
			await expect(invalid).toHaveCount(2)
			await expect(reason).toBeVisible()
			await expect(guidance).toBeVisible()
			await cell(0, 1).click()
			await expect(tray).toHaveCount(1)
			await expect(invalid).toHaveCount(0)
			await expect(reason).toHaveCount(0)
			await expect(guidance).toHaveCount(0)
			await expect(badge).toHaveCount(0)
		})
	}
}

for (const scenario of [
	{
		viewport: { width: 1440, height: 900 },
		colorScheme: 'light',
		locale: 'en-US',
		undo: 'Undo',
		both: 'Row 1 and Column 2 do not match their clues.',
		rowOnly: 'Row 3 does not match its clue.',
		red: 'rgb(168, 43, 35)',
	},
	{
		viewport: { width: 390, height: 844 },
		colorScheme: 'dark',
		locale: 'zh-TW',
		undo: '復原',
		both: '第 1 行和第 2 列的填色與數字提示不符。',
		rowOnly: '第 3 行的填色與數字提示不符。',
		red: 'rgb(242, 123, 112)',
	},
] as const) {
	const { viewport, colorScheme, locale, undo, both, rowOnly, red } = scenario
	test(`Nonogram flags clue mismatches and clears them on Undo (${viewport.width}×${viewport.height}, ${locale})`, async ({
		page,
	}) => {
		await page.setViewportSize(viewport)
		await page.emulateMedia({ colorScheme })
		const clues = Array.from({ length: 10 }, () => [1])
		await play(
			page,
			'nonogram',
			{ width: 10, height: 10, rowClues: clues, colClues: clues },
			locale,
			'medium',
		)
		await expect(page.locator('html')).toHaveCSS('color-scheme', colorScheme)

		const board = page.locator('[data-nonogram-board]')
		const grid = board.locator('.play-board')
		const cell = (row: number, col: number) =>
			grid.locator(`[data-paint-row="${row}"][data-paint-col="${col}"]`)
		const conflicts = grid.locator('[data-conflict], [aria-invalid]')
		const status = board.locator('p[role="status"]')
		const undoButton = board.getByRole('button', { name: undo, exact: true })
		await cell(0, 0).click()
		await cell(1, 1).click()
		await expect(conflicts).toHaveCount(0)
		await expect(status).toBeEmpty()
		await page.evaluate(() => document.fonts.ready)
		const geometry = async () => ({
			grid: await grid.boundingBox(),
			status: await status.boundingBox(),
			undo: await undoButton.boundingBox(),
			overflow: await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth),
		})
		const before = await geometry()
		expect(before.overflow).toBe(0)

		await cell(0, 1).click() // Overfills both clues while nine other lines on each axis are still valid.
		await expect(status).toHaveText(both)
		await expect(conflicts).toHaveCount(2)
		for (const id of ['paint-row-0', 'paint-col-1']) {
			const clue = grid.locator(`#${id}`)
			await expect(clue).toHaveAttribute('aria-invalid', 'true')
			await expect(clue).toHaveAttribute('data-conflict', 'true')
			await expect(clue.getByText('!', { exact: true })).toBeVisible()
			await expect(clue).toHaveCSS('color', red)
			const shadow = await clue.evaluate((element) => getComputedStyle(element).boxShadow)
			expect(shadow).toContain(`${red} 0px 0px 0px 2px inset`)
		}
		expect(await geometry()).toEqual(before)

		await undoButton.click()
		await expect(conflicts).toHaveCount(0)
		await expect(status).toBeEmpty()
		await expect(grid.getByText('!', { exact: true }).first()).toBeHidden()
		await expect(cell(0, 1)).toHaveAttribute('aria-pressed', 'false')
		await expect(cell(0, 0)).toHaveAttribute('aria-pressed', 'true')

		// Mark the row off one cell at a time; only the final mark rules out its clue.
		for (let col = 0; col < 9; col++) await cell(2, col).click({ button: 'right' })
		await expect(status).toBeEmpty()
		await cell(2, 9).click({ button: 'right' })
		await expect(status).toHaveText(rowOnly)
		await expect(conflicts).toHaveCount(1)
		await expect(grid.locator('#paint-row-2')).toHaveAttribute('aria-invalid', 'true')
		await undoButton.click()
		await expect(status).toBeEmpty()
		await expect(conflicts).toHaveCount(0)
	})
}
