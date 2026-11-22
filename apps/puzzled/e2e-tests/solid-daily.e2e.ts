import { expect, type Page, test } from '@playwright/test'
import crownsGoldens from '../../../crates/puzzled-core/tests/fixtures/generate/crowns.json'
import duoGoldens from '../../../crates/puzzled-core/tests/fixtures/generate/duo.json'
import cageGoldens from '../../../crates/puzzled-core/tests/fixtures/generate/killer-sudoku.json'
import pathGoldens from '../../../crates/puzzled-core/tests/fixtures/generate/number-path.json'
import matchGoldens from '../../../crates/puzzled-core/tests/fixtures/generate/pattern-match.json'
import fiveGoldens from '../../../crates/puzzled-core/tests/fixtures/generate/word-guess.json'
import ladderGoldens from '../../../crates/puzzled-core/tests/fixtures/generate/word-ladder.json'
import { productDayKey } from '../src/lib/product-day'

const boardStage = '[data-game-stage="board"]'
const date = productDayKey()

async function mount(
	page: Page,
	gameSlug: string,
	data: unknown,
	failOnce = false,
	options?: { puzzleId: string; grade?: (body: unknown) => unknown; reveal?: unknown },
) {
	let starts = 0
	let guests = 0
	const submits: { body: Record<string, unknown>; key?: string }[] = []
	const snapshot = {
		gameSlug,
		canPlay: true,
		puzzleDate: date,
		puzzleId: options?.puzzleId,
		puzzleDataJson: JSON.stringify(data),
	}
	await page.route('**/v1/guest/session', (r) => {
		guests++
		return r.fulfill({ json: { issued: true } })
	})
	await page.route('**/puzzled.v1.FunnelService/RecordEvent', (r) => r.fulfill({ json: {} }))
	await page.route('**/puzzled.v1.PuzzleService/*', async (r) => {
		const request = r.request()
		const body = request.postDataJSON()
		switch (new URL(request.url()).pathname.split('/').pop()) {
			case 'GetDaily':
				return r.fulfill({
					json: { gameSlug, puzzleDate: date, canPlay: true, requiresStart: true },
				})
			case 'StartDaily':
				starts++
				expect(body).toMatchObject({ gameSlug, puzzleDate: date })
				return r.fulfill({ json: { daily: snapshot } })
			case 'CheckGuess': {
				if (!options?.grade) throw new Error('Unexpected grade request')
				const grade = await options.grade(body)
				return grade === undefined
					? r.fulfill({ status: 503, json: { code: 'unavailable', message: 'fixture outage' } })
					: r.fulfill({ json: { resultJson: JSON.stringify(grade) } })
			}
			case 'SubmitGuess':
				submits.push({ body, key: request.headers()['x-puzzled-idempotency-key'] })
				return r.fulfill({
					json:
						failOnce && submits.length === 1
							? { valid: false, error: 'unavailable', revealJson: JSON.stringify(options?.reveal) }
							: { valid: true, status: body.status, revealJson: JSON.stringify(options?.reveal) },
				})
			case 'ShareResult':
				return r.fulfill({ json: { shareId: 'fixture-share' } })
			default:
				throw new Error(`Unexpected puzzle RPC: ${request.url()}`)
		}
	})
	const path =
		gameSlug === 'killer-sudoku'
			? `${gameSlug}?difficulty=medium&start=1`
			: ['nonogram', 'crowns'].includes(gameSlug)
				? `${gameSlug}?difficulty=easy&start=1`
				: `${gameSlug}?start=1`
	await page.goto(`/games/${path}#play`)
	const start = page.locator('[data-game-stage="start"]').getByRole('button', { name: 'Play' })
	await expect(start).toBeVisible()
	expect([guests, starts, submits.length]).toEqual([0, 0, 0])
	await start.click()
	const board = page.locator(boardStage)
	await expect(board).toBeVisible()
	expect([guests, starts]).toEqual([1, 1])
	return { board, submits }
}

test('Paint uses clue-only cells and retries the identical finish intent', async ({ page }) => {
	await page.setViewportSize({ width: 360, height: 750 })
	const { board, submits } = await mount(
		page,
		'nonogram',
		{
			width: 2,
			height: 2,
			rowClues: [[1], [1]],
			colClues: [[1], [1]],
		},
		true,
	)
	await board.getByRole('button', { name: 'Mark', exact: true }).click()
	await board.getByRole('button', { name: 'Row 1, Column 2' }).click()
	await expect(board.getByRole('button', { name: 'Row 1, Column 2' })).toHaveAttribute(
		'data-marked',
		'true',
	)
	await board.getByRole('button', { name: 'Fill', exact: true }).click()
	await board.getByRole('button', { name: 'Row 1, Column 1' }).click()
	expect(submits).toHaveLength(0)
	await board.getByRole('button', { name: 'Row 2, Column 2' }).click()
	const retry = board.getByRole('button', { name: 'Try again' })
	await expect(retry).toBeVisible()
	await expect(board.getByText('Picture Complete!')).toHaveCount(0)
	expect(submits).toHaveLength(1)
	expect(submits[0].key).toBeTruthy()
	expect(submits[0].body).toMatchObject({
		gameSlug: 'nonogram',
		puzzleDate: date,
		difficulty: 'easy',
		status: 'won',
	})
	expect(JSON.parse(String(submits[0].body.submissionJson))).toEqual({
		finalGrid: [
			[true, false],
			[false, true],
		],
	})
	await retry.click()
	await expect(board.getByText('Picture Complete!')).toBeVisible()
	expect(submits).toEqual([submits[0], submits[0]])
	expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(360)
})

test('Hunt accepts reverse drag and keyboard selection before saving the words', async ({
	page,
}) => {
	const { board, submits } = await mount(page, 'word-search', {
		grid: [
			['C', 'A', 'T'],
			['P', 'I', 'G'],
			['Q', 'X', 'Z'],
		],
		words: ['CAT', 'PIG'],
	})
	const end = await board.getByRole('button', { name: 'C, Row 1, Column 1' }).boundingBox()
	const start = await board.getByRole('button', { name: 'T, Row 1, Column 3' }).boundingBox()
	if (!start || !end) throw new Error('Hunt cells are not painted')
	await page.mouse.move(start.x + start.width / 2, start.y + start.height / 2)
	await page.mouse.down()
	await page.mouse.move(end.x + end.width / 2, end.y + end.height / 2, { steps: 6 })
	await page.mouse.up()
	await expect(board.getByText('CAT', { exact: true })).toHaveAttribute('data-found', 'true')
	expect(submits).toHaveLength(0)
	const p = board.getByRole('button', { name: 'P, Row 2, Column 1' })
	await p.press('Enter')
	await page.keyboard.press('ArrowRight')
	await page.keyboard.press('ArrowRight')
	await page.keyboard.press('Enter')
	await expect(board.getByText('All Words Found!')).toBeVisible()
	expect(submits).toHaveLength(1)
	expect(JSON.parse(String(submits[0].body.submissionJson))).toEqual({ foundWords: ['CAT', 'PIG'] })
})

const match = matchGoldens[0]

function matchCard(board: ReturnType<Page['locator']>, id: number) {
	return board.locator(`[data-match-card="${id}"]`)
}

test('Match finds overlapping sets, ignores duplicates, and offers sharing only after acceptance', async ({
	page,
}) => {
	await page.setViewportSize({ width: 360, height: 750 })
	const { board, submits } = await mount(page, 'pattern-match', match.puzzleData, true)
	const first = board.getByRole('button', { name: '1, green, squiggle, striped' })
	await expect(first).toBeVisible()
	const size = await first.boundingBox()
	expect(size?.width).toBeGreaterThanOrEqual(48)
	expect(size?.height).toBeGreaterThanOrEqual(48)
	expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(360)
	await first.press('Enter')
	await expect(first).toHaveAttribute('aria-pressed', 'true')
	await board.getByRole('button', { name: 'Clear' }).click()
	await expect(first).toHaveAttribute('aria-pressed', 'false')
	for (const id of [0, 1, 2]) await matchCard(board, id).click()
	await expect(board.getByText('Not a valid set')).toBeVisible()
	await expect(board.getByText('Mistakes: 1/4')).toBeVisible()

	const groups = match.solution.validSets
	for (const id of groups[0]) await matchCard(board, id).click()
	await expect(board.getByText('1/6 sets found')).toBeVisible()
	for (const id of [...groups[0]].reverse()) await matchCard(board, id).click()
	await expect(board.getByText('Set already found')).toBeVisible()
	await expect(board.getByText('Mistakes: 1/4')).toBeVisible()
	expect(submits).toHaveLength(0)
	for (const group of groups.slice(1)) {
		for (const id of group) await matchCard(board, id).click()
	}
	const retry = board.getByRole('button', { name: 'Try again' })
	await expect(retry).toBeVisible()
	await expect(matchCard(board, 0)).toBeDisabled()
	await expect(board.getByRole('button', { name: 'Share' })).toHaveCount(0)
	expect(submits).toHaveLength(1)
	expect(submits[0].key).toBeTruthy()
	expect(submits[0].body).toMatchObject({ gameSlug: 'pattern-match', status: 'won', attempts: 1 })
	expect(JSON.parse(String(submits[0].body.submissionJson))).toEqual({
		foundSets: groups,
		mistakes: 1,
	})
	await retry.click()
	await expect(board.getByText('All sets found!')).toBeVisible()
	await expect(board.getByRole('button', { name: 'Share' })).toBeVisible()
	expect(submits).toEqual([submits[0], submits[0]])
})

test('Match stops at the server mistake limit and records a loss', async ({ page }) => {
	const { board, submits } = await mount(page, 'pattern-match', match.puzzleData)
	for (let attempt = 0; attempt < 4; attempt++) {
		expect(submits).toHaveLength(0)
		for (const id of [0, 1, 2]) await matchCard(board, id).click()
	}
	await expect(board.getByRole('status').filter({ hasText: 'Game Over' })).toBeVisible()
	await expect(matchCard(board, 0)).toBeDisabled()
	expect(submits).toHaveLength(1)
	expect(submits[0].body).toMatchObject({ status: 'lost', attempts: 4 })
	expect(JSON.parse(String(submits[0].body.submissionJson))).toEqual({ foundSets: [], mistakes: 4 })
})

test('Match give-up records the sets found so far, not a win', async ({ page }) => {
	const { board, submits } = await mount(page, 'pattern-match', match.puzzleData)
	for (const id of match.solution.validSets[0]) await matchCard(board, id).click()
	await board.getByRole('button', { name: 'Give Up' }).click()
	await expect(board.getByRole('status').filter({ hasText: 'Game Over' })).toBeVisible()
	expect(submits).toHaveLength(1)
	expect(submits[0].body).toMatchObject({ status: 'lost' })
	expect(JSON.parse(String(submits[0].body.submissionJson))).toEqual({
		foundSets: [match.solution.validSets[0]],
		mistakes: 0,
	})
})

test('Crowns labels region boundaries, scopes keyboard controls, and submits only a valid grid', async ({
	page,
}) => {
	await page.setViewportSize({ width: 360, height: 750 })
	const crowns = crownsGoldens[0]
	if (!crowns.solution) throw new Error('Crowns golden fixture lacks its solution')
	const { board, submits } = await mount(page, 'crowns', crowns.puzzleData)
	const cell = (row: number, col: number) =>
		board.getByRole('button', { name: new RegExp(`^Row ${row + 1}, Column ${col + 1}, Region `) })
	const first = cell(0, 0)
	const second = cell(0, 1)
	await expect(board.getByRole('button', { name: 'Row 1, Column 3, Region 1' })).toHaveCSS(
		'border-right-width',
		'2px',
	)
	await expect(first).toHaveCSS('border-right-width', '1px')
	expect((await first.boundingBox())?.width).toBeGreaterThanOrEqual(48)
	expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(360)
	await first.press('Space')
	await expect(first).toHaveAttribute('aria-pressed', 'true')
	await page.keyboard.press('ArrowRight')
	await expect(second).toBeFocused()
	await page.keyboard.press('Enter')
	await expect(
		board.getByRole('status').filter({ hasText: 'Some crowns are in conflict' }),
	).toBeVisible()
	await expect(second).toHaveAttribute('aria-invalid', 'true')
	expect(submits).toHaveLength(0)
	await page.keyboard.press('Delete')
	await expect(second).toHaveAttribute('aria-pressed', 'false')
	await board.getByRole('button', { name: 'Start over' }).click()
	await expect(first).toHaveAttribute('aria-pressed', 'false')
	for (const [row, col] of crowns.solution.queens) await cell(row, col).click()
	await expect(board.getByText('Puzzle Complete!')).toBeVisible()
	await expect(first).toBeDisabled()
	expect(submits).toHaveLength(1)
	expect(submits[0].body).toMatchObject({ gameSlug: 'crowns', status: 'won', difficulty: 'easy' })
	expect(JSON.parse(String(submits[0].body.submissionJson))).toEqual({
		finalGrid: [
			[false, false, true, false, false],
			[false, false, false, false, true],
			[false, true, false, false, false],
			[false, false, false, true, false],
			[true, false, false, false, false],
		],
	})
})

test('Duo preserves fixed clues and rejects a filled grid with conflicts before submitting', async ({
	page,
}) => {
	await page.setViewportSize({ width: 360, height: 750 })
	const duo = duoGoldens[0]
	if (!duo.solution) throw new Error('Duo golden fixture lacks its solution')
	const { board, submits } = await mount(page, 'duo', duo.puzzleData)
	const cell = (row: number, col: number) =>
		board.getByRole('button', { name: new RegExp(`^Row ${row + 1}, Column ${col + 1}, `) })
	const given = board.getByRole('button', { name: 'Row 1, Column 1, Moon' })
	await expect(given).toBeDisabled()
	const edited = cell(0, 3)
	await edited.press('Space')
	await expect(edited).toHaveAccessibleName('Row 1, Column 4, Sun')
	await edited.press('Enter')
	await expect(edited).toHaveAccessibleName('Row 1, Column 4, Moon')
	await edited.press('Enter')
	await expect(edited).toHaveAccessibleName('Row 1, Column 4, Blank')
	await edited.click()
	await board.getByRole('button', { name: 'Start over' }).click()
	await expect(edited).toHaveAccessibleName('Row 1, Column 4, Blank')
	await expect(given).toBeDisabled()
	expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(360)

	for (const [row, line] of duo.solution.grid.entries()) {
		for (const [col, value] of line.entries()) {
			if (duo.puzzleData.initialGrid[row][col] || (row === 1 && col === 4)) continue
			await cell(row, col).click()
			if (value === 'moon') await cell(row, col).click()
		}
	}
	// Fill the last cell with the wrong symbol, then clear and place the right one.
	const last = cell(1, 4)
	await last.click()
	await expect(last).toHaveAccessibleName('Row 2, Column 5, Sun')
	await expect(last).toHaveAttribute('aria-invalid', 'true')
	await expect(
		board.getByRole('status').filter({ hasText: 'Some cells violate the rules' }),
	).toBeVisible()
	expect(submits).toHaveLength(0)
	await last.press('Delete')
	await expect(last).toHaveAccessibleName('Row 2, Column 5, Blank')
	await last.click()
	await last.click()
	await expect(board.getByText('Puzzle Complete!')).toBeVisible()
	await expect(last).toBeDisabled()
	expect(submits).toHaveLength(1)
	expect(submits[0].body).toMatchObject({ gameSlug: 'duo', status: 'won' })
	expect(JSON.parse(String(submits[0].body.submissionJson))).toEqual({ grid: duo.solution.grid })
})

test('Path keeps clues fixed and records only a complete legal route', async ({ page }) => {
	await page.setViewportSize({ width: 360, height: 750 })
	const fixture = pathGoldens[0]
	if (!fixture.solution) throw new Error('Path golden fixture lacks its solution')
	const { board, submits } = await mount(page, 'number-path', fixture.puzzleData, true)
	const cell = (row: number, col: number) =>
		board.getByRole('button', {
			name: new RegExp(`^Row ${row + 1}, Column ${col + 1}(,|$)`),
		})
	const start = cell(3, 3)
	const next = cell(4, 3)
	const earlyClue = cell(3, 4)
	const trail = board.locator('polyline')
	await expect(board.getByRole('group', { name: 'Path' }).getByRole('button')).toHaveCount(36)
	await expect(start).toHaveText('1')
	await expect(earlyClue).toHaveAccessibleName('Row 4, Column 5, Clue 8')
	await expect(earlyClue).toHaveText('8')
	expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(360)
	const startBox = await start.boundingBox()
	const nextBox = await next.boundingBox()
	if (!startBox || !nextBox) throw new Error('Missing Path tile hit geometry')
	expect(startBox.width).toBeGreaterThanOrEqual(48)
	expect(startBox.height).toBeGreaterThanOrEqual(48)

	await next.click()
	await expect(next).toHaveAttribute('aria-pressed', 'false')
	await start.press('Space')
	await earlyClue.click()
	await expect(earlyClue).toHaveAttribute('aria-pressed', 'false')
	await cell(2, 2).click()
	await expect(cell(2, 2)).toHaveAttribute('aria-pressed', 'false')
	await start.press('ArrowDown')
	await expect(next).toBeFocused()
	await page.keyboard.press('Enter')
	await expect(next).toHaveAccessibleName('Row 5, Column 4, Step 2')
	await expect(trail).toHaveAttribute('points', '3.5,3.5 3.5,4.5')
	await board.getByRole('button', { name: 'Undo' }).click()
	await expect(next).toHaveAttribute('aria-pressed', 'false')

	await page.mouse.move(startBox.x + startBox.width / 2, startBox.y + startBox.height / 2)
	await page.mouse.down()
	await page.mouse.move(nextBox.x + nextBox.width / 2, nextBox.y + nextBox.height / 2, { steps: 5 })
	await page.mouse.up()
	await expect(next).toHaveText('2')
	await cell(5, 3).click()
	await start.click()
	await expect(trail).toHaveAttribute('points', '3.5,3.5')
	await board.getByRole('button', { name: 'Start over' }).click()
	await expect(trail).toHaveAttribute('points', '')
	await expect(start).toHaveText('1')
	await expect(earlyClue).toHaveText('8')
	expect(submits).toHaveLength(0)

	for (const { row, col } of fixture.solution.path.slice(0, -1)) await cell(row, col).click()
	expect(submits).toHaveLength(0)
	const last = fixture.solution.path.at(-1)
	if (!last) throw new Error('Path golden fixture path is empty')
	await cell(last.row, last.col).click()
	const retry = board.getByRole('button', { name: 'Try again' })
	await expect(retry).toBeVisible()
	await expect(cell(last.row, last.col)).toBeDisabled()
	await expect(board.getByText('Path complete!')).toHaveCount(0)
	expect(submits).toHaveLength(1)
	expect(submits[0].key).toBeTruthy()
	expect(submits[0].body).toMatchObject({ gameSlug: 'number-path', status: 'won', attempts: 1 })
	expect(JSON.parse(String(submits[0].body.submissionJson))).toEqual({
		path: fixture.solution.path,
	})
	await retry.click()
	await expect(board.getByText('Path complete!')).toBeVisible()
	expect(submits).toEqual([submits[0], submits[0]])
})

test.describe('Path touch input', () => {
	test.use({ hasTouch: true, viewport: { width: 390, height: 844 } })

	test('extends the route with taps and does not submit a partial route', async ({ page }) => {
		const { board, submits } = await mount(page, 'number-path', pathGoldens[0].puzzleData)
		const start = board.getByRole('button', { name: 'Row 4, Column 4, Clue 1' })
		const next = board.getByRole('button', { name: /^Row 5, Column 4(,|$)/ })
		await start.tap()
		await next.tap()
		await expect(start).toHaveAttribute('aria-pressed', 'true')
		await expect(next).toHaveText('2')
		expect(submits).toHaveLength(0)
	})
})

const groupCategories = [
	{ name: 'Fruit', words: ['APPLE', 'BANANA', 'ORANGE', 'GRAPE'], level: 0 },
	{ name: 'Colours', words: ['RED', 'BLUE', 'GREEN', 'YELLOW'], level: 1 },
	{ name: 'Planets', words: ['MARS', 'VENUS', 'SATURN', 'JUPITER'], level: 2 },
	{ name: 'Card suits', words: ['HEART', 'DIAMOND', 'CLUB', 'SPADE'], level: 3 },
]
const groupWords = groupCategories.flatMap(({ words }) => words)
const groupPuzzleId = '27012566-82c8-4b30-bb3e-9cd08b7f35a1'

function mountGroups(page: Page, grade: (body: unknown) => unknown) {
	return mount(
		page,
		'word-groups',
		{ words: groupWords, maxMistakes: 4, wordsPerCategory: 4, totalCategories: 4 },
		true,
		{
			puzzleId: groupPuzzleId,
			grade,
			reveal: { categories: groupCategories },
		},
	)
}

test('Groups retries a failed grade, ignores repeat sets, and reveals a loss only after acceptance', async ({
	page,
}) => {
	await page.setViewportSize({ width: 360, height: 750 })
	const oneAway = ['APPLE', 'BANANA', 'ORANGE', 'RED']
	const misses = [
		['RED', 'BLUE', 'HEART', 'CLUB'],
		['VENUS', 'MARS', 'SPADE', 'DIAMOND'],
	]
	const { promise: held, resolve: releaseGrade } = Promise.withResolvers<void>()
	const checks: unknown[] = []
	const { board, submits } = await mountGroups(page, async (body) => {
		checks.push(body)
		if (checks.length === 1) {
			await held
			return undefined
		}
		if (checks.length === 3) return { correct: true, oneAway: false, category: groupCategories[0] }
		return { correct: false, oneAway: checks.length === 2 }
	})
	const word = (name: string) => board.getByRole('button', { name, exact: true })
	const submit = word('Submit')
	const chosen = board.locator('button[aria-pressed="true"]')
	const choose = async (words: string[]) => {
		for (const name of words) await word(name).click()
	}
	const categories = board.locator('[data-group-category] h3')
	const remaining = (count: number) => board.getByLabel(`${count} of 4 mistakes remaining`)
	await expect(categories).toHaveCount(0)
	await expect(board.locator('button[aria-pressed]')).toHaveCount(16)
	await expect(remaining(4)).toBeVisible()
	await expect(submit).toBeDisabled()
	await word('APPLE').focus()
	await page.keyboard.press('Space')
	await expect(word('APPLE')).toHaveAttribute('aria-pressed', 'true')
	await word('Deselect All').click()
	await expect(chosen).toHaveCount(0)
	await choose(oneAway)
	await word('JUPITER').click()
	await expect(chosen).toHaveCount(4)
	await expect(word('JUPITER')).toHaveAttribute('aria-pressed', 'false')
	await word('Shuffle').click()
	await expect(chosen).toHaveCount(4)
	await submit.click()
	try {
		await expect.poll(() => checks.length).toBe(1)
		await expect(submit).toBeDisabled()
		await expect(word('BANANA')).toBeDisabled()
		await expect(word('Shuffle')).toBeDisabled()
	} finally {
		releaseGrade()
	}
	await expect(board.getByText('Something went wrong', { exact: true })).toBeVisible()
	await expect(chosen).toHaveCount(4)
	await expect(remaining(4)).toBeVisible()
	await submit.click()
	await expect(board.getByText('One away...', { exact: true })).toBeVisible()
	await expect(remaining(3)).toBeVisible()
	await choose([...oneAway].reverse())
	await submit.click()
	await expect(chosen).toHaveCount(0)
	await expect(remaining(3)).toBeVisible()
	expect(checks).toHaveLength(2)
	await choose(groupCategories[0].words)
	await submit.click()
	await expect(categories).toHaveText(['Fruit'])
	await expect(board.locator('button[aria-pressed]')).toHaveCount(12)
	for (const words of misses) {
		await choose(words)
		await submit.click()
		await expect(chosen).toHaveCount(0)
	}
	const last = ['RED', 'BLUE', 'VENUS', 'MARS']
	await choose(last)
	await submit.click()
	const retry = word('Try again')
	await expect(retry).toBeVisible()
	await expect(categories).toHaveText(['Fruit'])
	await expect(board.getByText('Better luck next time!')).toHaveCount(0)
	expect(checks).toEqual(
		[oneAway, oneAway, groupCategories[0].words, ...misses, last].map((words, i) => ({
			gameSlug: 'word-groups',
			puzzleId: groupPuzzleId,
			puzzleDate: date,
			guessJson: JSON.stringify({ words, solved: i >= 3 ? ['Fruit'] : [] }),
		})),
	)
	expect(submits).toHaveLength(1)
	expect(submits[0].body).toMatchObject({
		gameSlug: 'word-groups',
		puzzleId: groupPuzzleId,
		puzzleDate: date,
		status: 'lost',
		attempts: 5,
	})
	expect(JSON.parse(String(submits[0].body.submissionJson))).toEqual({
		foundCategories: [groupCategories[0].words],
		mistakes: 4,
	})
	await retry.click()
	await expect(board.getByText('Better luck next time!')).toBeVisible()
	await expect(categories).toHaveText(groupCategories.map(({ name }) => name))
	expect(submits).toHaveLength(2)
	expect(submits[0].key).toBeTruthy()
	expect(submits[1]).toEqual(submits[0])
})

test('Groups displays solved sets in level order and submits the four accepted sets', async ({
	page,
}) => {
	const solvedOrder = [...groupCategories].reverse()
	const checks: unknown[] = []
	const { board, submits } = await mountGroups(page, (body) => {
		checks.push(body)
		return { correct: true, oneAway: false, category: solvedOrder[checks.length - 1] }
	})
	const categories = board.locator('[data-group-category] h3')
	for (const [i, category] of solvedOrder.entries()) {
		for (const name of category.words)
			await board.getByRole('button', { name, exact: true }).click()
		await board.getByRole('button', { name: 'Submit', exact: true }).click()
		await expect(categories).toHaveText(
			solvedOrder
				.slice(0, i + 1)
				.reverse()
				.map(({ name }) => name),
		)
	}
	await expect(board.getByText('Congratulations!')).toHaveCount(0)
	await board.getByRole('button', { name: 'Try again' }).click()
	await expect(board.getByText('Congratulations!')).toBeVisible()
	expect(checks).toHaveLength(4)
	expect(submits[0].body).toMatchObject({ status: 'won', attempts: 4 })
	expect(JSON.parse(String(submits[0].body.submissionJson))).toEqual({
		foundCategories: solvedOrder.map(({ words }) => words),
		mistakes: 0,
	})
})

test('Cage Sudoku honors cage sums, keeps givens fixed and retries the exact accepted grid', async ({
	page,
}) => {
	await page.setViewportSize({ width: 360, height: 750 })
	const fixture = cageGoldens.find(
		(entry) => entry.difficulty === 'medium' && entry.puzzleData && entry.solution,
	)
	if (!fixture?.puzzleData || !fixture.solution)
		throw new Error('Expected a playable medium golden')
	const puzzleId = '7ac66c17-0842-4c14-8133-a0638338fa6d'
	const { board, submits } = await mount(page, 'killer-sudoku', fixture.puzzleData, true, {
		puzzleId,
	})
	const grid = board.getByRole('group', { name: 'Cage Sudoku' })
	await expect(grid.getByRole('button')).toHaveCount(81)
	const cell = (row: number, col: number) =>
		grid.getByRole('button', { name: new RegExp(`^Row ${row + 1}, Column ${col + 1},`) })
	await expect(board.getByRole('link', { name: 'How to play' })).toHaveAttribute('href', '#rules')
	const first = cell(0, 0)
	await expect(first).toHaveAccessibleName('Row 1, Column 1, Cage total 24')
	await expect(first).toHaveText('24')
	await first.click()
	await first.press('n')
	await board.getByRole('button', { name: '5', exact: true }).click()
	await expect(first).toHaveAccessibleName('Row 1, Column 1, Cage total 24, Notes: 5')
	await first.press('Backspace')
	await expect(first).toHaveAccessibleName('Row 1, Column 1, Cage total 24')
	await first.press('n')
	await first.press('ArrowRight')
	const second = cell(0, 1)
	await expect(second).toBeFocused()
	await page.keyboard.press('2')
	await expect(second).toHaveAttribute('aria-invalid', 'true')
	const given = cell(0, 8)
	await given.press('1')
	await expect(given).toHaveAccessibleName('Row 1, Column 9, 2, Cage total 21')
	await board.getByRole('button', { name: 'Start over' }).click()
	await expect(second).toHaveAccessibleName('Row 1, Column 2, Cage total 24')
	await expect(given).toHaveAccessibleName('Row 1, Column 9, 2, Cage total 21')

	// Swapping two digits absent from the givens leaves an ordinary solved Sudoku, but changes cage sums.
	const swapped = (digit: number) => (digit === 1 ? 6 : digit === 6 ? 1 : digit)
	for (const [row, values] of fixture.solution.grid.entries()) {
		for (const [col, digit] of values.entries()) {
			if (fixture.puzzleData.grid[row][col] === null)
				await cell(row, col).press(String(swapped(digit)))
		}
	}
	await expect(grid.getByRole('button', { name: /^Row 9, Column 9, 6,/ })).toBeEnabled()
	await expect(grid.locator('[aria-invalid="true"]')).toHaveCount(0)
	await expect(board.getByText('Puzzle Complete!')).toHaveCount(0)
	expect(submits).toHaveLength(0)

	for (const [row, values] of fixture.solution.grid.entries()) {
		for (const [col, digit] of values.entries()) {
			if (digit !== swapped(digit)) await cell(row, col).press(String(digit))
		}
	}
	const retry = board.getByRole('button', { name: 'Try again' })
	await expect(retry).toBeVisible()
	await expect(first).toBeDisabled()
	await expect(board.getByText('Puzzle Complete!')).toHaveCount(0)
	expect(submits).toHaveLength(1)
	expect(submits[0].key).toBeTruthy()
	expect(submits[0].body).toMatchObject({
		gameSlug: 'killer-sudoku',
		puzzleId,
		puzzleDate: date,
		difficulty: 'medium',
		status: 'won',
		attempts: 1,
	})
	expect(JSON.parse(String(submits[0].body.submissionJson))).toEqual({
		finalGrid: fixture.solution.grid,
		mistakes: 0,
	})
	await retry.click()
	await expect(board.getByText('Puzzle Complete!')).toBeVisible()
	expect(submits).toEqual([submits[0], submits[0]])
})

test('Rungs validates steps, preserves undo and waits for the exact saved path', async ({
	page,
}) => {
	await page.setViewportSize({ width: 360, height: 750 })
	const puzzleId = '330993b1-f969-4e16-99cb-7dea3790122c'
	const fixture = ladderGoldens[0]
	const { board, submits } = await mount(page, 'word-ladder', fixture.puzzleData, true, {
		puzzleId,
	})
	const input = board.getByRole('textbox', { name: 'Enter a word...' })
	const rungs = board.getByRole('list', { name: 'Rungs' }).getByRole('listitem')
	const go = board.getByRole('button', { name: 'Go', exact: true })
	const undo = board.getByRole('button', { name: 'Undo' })
	const type = async (word: string) => {
		await input.fill(word)
		await input.press('Enter')
	}
	await expect(board.getByText('TOMB', { exact: false }).first()).toBeVisible()
	await expect(board.getByText('0 steps · Minimum: 4')).toBeVisible()
	await expect(input).toHaveAttribute('maxlength', '4')
	await expect(go).toBeDisabled()
	await expect(undo).toBeDisabled()
	await expect(rungs).toHaveCount(1)
	await expect(board.getByText('dame', { exact: true })).toHaveCount(0)

	await type('ZZZZ')
	await expect(input).toHaveAttribute('aria-invalid', 'true')
	await expect(input).toHaveAccessibleDescription('Not a valid word')
	await type('hot')
	await expect(input).toHaveAccessibleDescription('Word must be the same length')
	await type('tomb')
	await expect(input).toHaveAccessibleDescription('Change exactly one letter')
	await expect(rungs).toHaveCount(1)

	await input.fill('LAMP')
	await go.click()
	await expect(input).toBeFocused()
	await expect(input).toHaveValue('')
	await expect(rungs.last()).toHaveAttribute('aria-current', 'step')
	await expect(rungs.last().locator('[data-changed]')).toHaveText('l')
	await expect(board.getByText('1 step · Minimum: 4')).toBeVisible()
	await type('damp')
	await expect(input).toHaveAccessibleDescription('Already used this word')
	await undo.click()
	await expect(rungs).toHaveCount(1)
	await expect(input).toBeFocused()
	await expect(input).not.toHaveAttribute('aria-invalid')
	expect(submits).toHaveLength(0)

	for (const word of fixture.solution.path.slice(1)) await type(word)
	const retry = board.getByRole('button', { name: 'Try again' })
	await expect(retry).toBeVisible()
	await expect(input).toHaveCount(0)
	await expect(undo).toHaveCount(0)
	await expect(board.getByText('You made it!')).toHaveCount(0)
	await expect(board.getByRole('button', { name: 'Share' })).toHaveCount(0)
	expect(submits).toHaveLength(1)
	expect(submits[0].key).toBeTruthy()
	expect(submits[0].body).toMatchObject({
		gameSlug: 'word-ladder',
		puzzleId,
		puzzleDate: date,
		status: 'won',
		attempts: 4,
	})
	expect(JSON.parse(String(submits[0].body.submissionJson))).toEqual({
		path: fixture.solution.path,
	})
	await retry.click()
	await expect(board.getByText('You made it!')).toBeVisible()
	await expect(board.getByRole('button', { name: 'Share' })).toBeVisible()
	expect(submits).toEqual([submits[0], submits[0]])
})

test('Five freezes the pending guess and uses only server tile grades', async ({ page }) => {
	await page.setViewportSize({ width: 360, height: 750 })
	const puzzleId = '5bcd0c76-f347-469a-a344-a96ef6b409e2'
	const fixture = fiveGoldens[0]
	const grades: string[] = []
	let release = () => {}
	const delayed = new Promise<void>((resolve) => {
		release = resolve
	})
	const { board, submits } = await mount(page, 'word-guess', fixture.puzzleData, true, {
		puzzleId,
		async grade(raw) {
			const body = raw as { guessJson: string }
			expect(body).toMatchObject({ gameSlug: 'word-guess', puzzleDate: date, puzzleId })
			const { word } = JSON.parse(body.guessJson)
			grades.push(word)
			if (grades.length === 1) {
				await delayed
				return undefined
			}
			return word === 'crane'
				? { tiles: ['absent', 'present', 'absent', 'absent', 'absent'] }
				: { tiles: Array(5).fill('correct') }
		},
	})
	const table = board.getByRole('table', { name: 'Five' })
	const rows = table.getByRole('row')
	const key = (letter: string) => board.getByRole('button', { name: letter, exact: true })
	const enter = key('Enter')
	await expect(rows).toHaveCount(6)
	await expect(rows.first().getByRole('cell')).toHaveCount(5)
	await expect(board.getByText(fixture.solution.word, { exact: true })).toHaveCount(0)
	await enter.click()
	await expect(board.getByRole('alert')).toHaveText('Not enough letters')
	await page.keyboard.type('zzzzz')
	await enter.click()
	await expect(board.getByRole('alert')).toHaveText('Not in word list')
	expect(grades).toEqual([])
	for (let i = 0; i < 5; i++) await page.keyboard.press('Backspace')
	await page.keyboard.type('crane')
	await enter.click()
	try {
		await expect(enter).toBeDisabled()
		await page.keyboard.press('Backspace')
		await page.keyboard.press('X')
		await page.keyboard.press('Enter')
		await expect(rows.first().getByRole('cell').last()).toHaveText('E')
		expect(grades).toEqual(['crane'])
	} finally {
		release()
	}
	await expect(board.getByRole('alert')).toHaveText('Something went wrong')
	await expect(rows.first().getByRole('cell').last()).toHaveText('E')
	await expect(rows.locator('[data-grade]')).toHaveCount(0)
	await enter.click()
	await expect(rows.first().locator('[data-grade="present"]')).toHaveAccessibleName(/Yellow means/)
	await expect(key('R')).toHaveAttribute('data-grade', 'present')
	expect(submits).toHaveLength(0)
	for (const letter of 'FORTZ') await key(letter).click()
	await key('Delete').click()
	await key('Y').click()
	await enter.click()
	const retry = board.getByRole('button', { name: 'Try again' })
	await expect(retry).toBeVisible()
	await expect(board.getByText('Excellent!')).toHaveCount(0)
	await expect(key('Share')).toHaveCount(0)
	expect(grades).toEqual(['crane', 'crane', 'forty'])
	expect(submits[0].body).toMatchObject({
		gameSlug: 'word-guess',
		puzzleDate: date,
		puzzleId,
		status: 'won',
		attempts: 2,
	})
	expect(submits[0].key).toBeTruthy()
	expect(JSON.parse(String(submits[0].body.submissionJson))).toEqual({
		guesses: ['crane', 'forty'],
	})
	await retry.click()
	await expect(board.getByText('Excellent!')).toBeVisible()
	await expect(key('Share')).toBeVisible()
	expect(submits).toEqual([submits[0], submits[0]])
})

test('Five uses six real keyboard guesses and reveals only on an accepted loss', async ({
	page,
}) => {
	const puzzleId = 'e64664cb-3a76-4888-ab8b-daae90821cab'
	const fixture = fiveGoldens[0]
	const guesses = ['crane', 'raise', 'blush', 'flame', 'sugar', 'lemon']
	const { board, submits } = await mount(page, 'word-guess', fixture.puzzleData, true, {
		puzzleId,
		grade: () => ({ tiles: ['absent', 'absent', 'absent', 'absent', 'absent'] }),
		reveal: fixture.solution,
	})
	const table = board.getByRole('table', { name: 'Five' })
	await table.getByRole('cell').first().click()
	for (const [i, word] of guesses.entries()) {
		await page.keyboard.type(word)
		await page.keyboard.press('Enter')
		await expect(table.getByRole('row').nth(i).locator('[data-grade="absent"]')).toHaveCount(5)
		if (i < 5) expect(submits).toHaveLength(0)
	}
	const retry = board.getByRole('button', { name: 'Try again' })
	await expect(retry).toBeVisible()
	await expect(board.getByRole('button', { name: 'Enter' })).toHaveCount(0)
	await expect(board.getByText('The word was FORTY')).toHaveCount(0)
	expect(submits[0].body).toMatchObject({ puzzleId, puzzleDate: date, status: 'lost', attempts: 6 })
	expect(JSON.parse(String(submits[0].body.submissionJson))).toEqual({ guesses })
	await retry.click()
	await expect(board.getByText('The word was FORTY')).toBeVisible()
	expect(submits).toEqual([submits[0], submits[0]])
	await page.context().grantPermissions(['clipboard-read', 'clipboard-write'])
	await board.getByRole('button', { name: 'Share' }).click()
	const share = await page.evaluate(() => navigator.clipboard.readText())
	expect(share).toContain(Array(6).fill('⬛⬛⬛⬛⬛').join('\n'))
	expect(share).toContain('/r/fixture-share?utm_source=share')
	expect(share).not.toMatch(/forty|crane/i)
})
