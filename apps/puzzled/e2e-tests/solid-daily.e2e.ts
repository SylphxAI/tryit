import { expect, type Page, test } from '@playwright/test'
import matchGoldens from '../../../crates/puzzled-core/tests/fixtures/generate/pattern-match.json'
import { productDayKey } from '../src/lib/product-day'

const boardStage = '[data-game-stage="board"]'
const date = productDayKey()

async function mount(page: Page, gameSlug: string, data: unknown, failOnce = false) {
	let starts = 0
	let guests = 0
	const submits: { body: Record<string, unknown>; key?: string }[] = []
	const snapshot = {
		gameSlug,
		canPlay: true,
		puzzleDate: date,
		puzzleDataJson: JSON.stringify(data),
	}
	await page.route('**/v1/guest/session', (r) => {
		guests++
		return r.fulfill({ json: { issued: true } })
	})
	await page.route('**/puzzled.v1.FunnelService/RecordEvent', (r) => r.fulfill({ json: {} }))
	await page.route('**/puzzled.v1.PuzzleService/*', (r) => {
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
			case 'SubmitGuess':
				submits.push({ body, key: request.headers()['x-puzzled-idempotency-key'] })
				return r.fulfill({
					json:
						failOnce && submits.length === 1
							? { valid: false, error: 'unavailable' }
							: { valid: true, status: body.status },
				})
			case 'ShareResult':
				return r.fulfill({ json: { shareId: 'fixture-share' } })
			default:
				throw new Error(`Unexpected puzzle RPC: ${request.url()}`)
		}
	})
	const path =
		gameSlug === 'nonogram' ? `${gameSlug}?difficulty=easy&start=1` : `${gameSlug}?start=1`
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
