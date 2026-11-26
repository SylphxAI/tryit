import { devices, expect, type Locator, type Page, test } from '@playwright/test'
import sudokuGoldens from '../../../crates/puzzled-core/tests/fixtures/generate/sudoku.json'
import { productDayKey } from '../src/lib/product-day'

const fivePath = '/en-US/games/word-guess?start=1#play'
const firstPuzzleId = '11a198bc-8079-4830-8c07-0d397aaabc73'
const otherPuzzleId = 'a14c91a8-b26b-49ce-b916-61bb16c76e9e'

// Run against a locally served production build with serve-puzzle-fixture.ts.
// Every browser mutation is intercepted; this suite never submits a live finish.
function requireLocalFixture(baseURL?: string) {
	const host = new URL(baseURL || 'http://localhost:3000').hostname
	if (!['localhost', '127.0.0.1'].includes(host))
		throw new Error('Board craft requires a local fixture')
}

async function routeSudoku(page: Page) {
	await page.route('**/v1/guest/session', (route) => route.fulfill({ json: { issued: true } }))
	const puzzleDate = productDayKey()
	const puzzleData = sudokuGoldens.find((puzzle) => puzzle.difficulty === 'easy')?.puzzleData
	if (!puzzleData) throw new Error('Missing easy Sudoku golden')
	const daily = { gameSlug: 'sudoku', puzzleDate, canPlay: true }
	await page.route('**/puzzled.v1.PuzzleService/GetDaily', (route) =>
		route.fulfill({ json: { ...daily, requiresStart: true } }),
	)
	await page.route('**/puzzled.v1.PuzzleService/StartDaily', (route) =>
		route.fulfill({ json: { daily: { ...daily, puzzleDataJson: JSON.stringify(puzzleData) } } }),
	)
	await page.route('**/puzzled.v1.PuzzleService/SubmitGuess', (route) =>
		route.fulfill({ json: { valid: false, error: 'Craft fixture: no finish accepted' } }),
	)
}

async function start(page: Page, baseURL?: string, locale = 'en-US') {
	requireLocalFixture(baseURL)
	await routeSudoku(page)
	await page.goto(`/${locale}/games/sudoku?difficulty=easy&start=1#play`)
	const decline = page.getByRole('button', { name: /^(Decline|拒絕)$/ })
	if (await decline.isVisible()) await decline.click()
	await page.locator('[data-game-stage="start"]').getByRole('button').click()
	const board = page.locator('[role="group"]').filter({ has: page.locator('button[data-given]') })
	await expect(board).toBeVisible()
	await expect(board.locator('button')).toHaveCount(81)
	return board
}

async function dimensions(controls: Locator) {
	for (const control of await controls.all()) {
		const box = await control.boundingBox()
		expect(box).not.toBeNull()
		expect(box!.width).toBeGreaterThanOrEqual(48)
		expect(box!.height).toBeGreaterThanOrEqual(48)
	}
}

for (const [width, height] of [
	[1440, 900],
	[768, 1024],
	[390, 844],
	[375, 667],
]) {
	test(`board and controls at ${width}x${height}`, async ({ page, baseURL }, testInfo) => {
		await page.setViewportSize({ width, height })
		const board = await start(page, baseURL)
		const blank = board.locator('button:not([data-given])').first()
		await blank.click()
		await expect(blank).toHaveAttribute('data-selected', 'true')
		await expect(board.locator('[data-related]')).not.toHaveCount(0)
		await page.keyboard.press('n')
		await page.getByRole('button', { name: '3', exact: true }).click()
		await expect(blank.locator('[data-visible]')).toHaveText('3')
		await page.keyboard.press('Control+z')
		await expect(blank.locator('[data-visible]')).toHaveCount(0)
		await page.keyboard.press('n')
		await page.keyboard.press('4')
		await expect(blank).toHaveAttribute('data-filled', 'true')
		await expect(blank.locator('span').first()).toHaveCSS('text-decoration-line', 'underline')
		await page.getByRole('button', { name: 'Undo', exact: true }).click()
		await expect(blank).not.toHaveAttribute('data-filled')
		await blank.click()
		await page.keyboard.press('ArrowRight')
		await expect(board.locator('[data-selected]')).toHaveCount(1)
		await blank.click()
		const row = (await blank.getAttribute('aria-label'))!.match(/Row (\d+)/)![1]
		const given = board.locator('button[data-given]').filter({ hasText: /[1-9]/ })
		const rowGiven = given
			.and(board.getByRole('button', { name: new RegExp(`^Row ${row},`) }))
			.first()
		const value = (await rowGiven.getAttribute('aria-label'))!.match(/, ([1-9])$/)![1]
		await page.keyboard.press(value)
		await expect(blank).toHaveAttribute('data-conflict', 'true')
		await expect(blank.locator('[aria-hidden="true"]')).toHaveText('!')
		await expect(board.locator('[data-matching]')).not.toHaveCount(0)
		await page.keyboard.press('Delete')
		await expect(blank).not.toHaveAttribute('data-filled')
		await page.keyboard.press('n')
		await page.keyboard.press('2')
		await page.keyboard.press('7')
		const pad = page.getByRole('button', { name: 'Clear', exact: true }).locator('..').locator('..')
		await dimensions(pad.getByRole('button'))
		await expect
			.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth))
			.toBe(true)
		await page.getByRole('button', { name: 'Notes Mode', exact: true }).scrollIntoViewIfNeeded()
		await page.screenshot({
			path: testInfo.outputPath(`board-${width}x${height}.png`),
			fullPage: false,
		})
	})
}

test('dark CJK controls retain geometry and reduced-motion focus', async ({
	page,
	baseURL,
}, testInfo) => {
	await page.setViewportSize({ width: 390, height: 844 })
	await page.emulateMedia({ colorScheme: 'dark', reducedMotion: 'reduce' })
	const board = await start(page, baseURL, 'zh-HK')
	const blank = board.locator('button:not([data-given])').first()
	await blank.click()
	await page.keyboard.press('n')
	await page.keyboard.press('2')
	await page.keyboard.press('Tab')
	await expect(page.locator(':focus-visible')).toHaveCSS('outline-width', '3px')
	// Global reduced-motion policy uses 0.01ms rather than an exact zero.
	await expect
		.poll(() =>
			blank.evaluate((cell) => {
				const durations = getComputedStyle(cell).transitionDuration.split(',')
				return Math.max(
					...durations.map((duration) => {
						const unit = duration.trim().endsWith('ms') ? 1 : 1000
						return Number.parseFloat(duration) * unit
					}),
				)
			}),
		)
		.toBeLessThanOrEqual(0.01)
	const notes = page.getByRole('button', { name: '筆記模式', exact: true })
	await dimensions(notes)
	await notes.scrollIntoViewIfNeeded()
	await page.screenshot({ path: testInfo.outputPath('board-dark-zh-HK.png'), fullPage: false })
})

for (const scenario of [
	'same run',
	'guest run',
	'other account',
	'other day',
	'other puzzle',
] as const) {
	test(`Five pending guess follows only the exact run (${scenario})`, async ({
		page,
		baseURL,
		context,
	}) => {
		requireLocalFixture(baseURL)
		const now = new Date()
		const today = productDayKey(now)
		const restore = scenario === 'same run' || scenario === 'guest run'
		let puzzleDate = today
		let puzzleId = firstPuzzleId
		const guesses: unknown[] = []
		const finishes: unknown[] = []
		const received = Promise.withResolvers<void>()
		const release = Promise.withResolvers<void>()
		const acknowledged = Promise.withResolvers<void>()
		const cookie = (value: string) => ({
			name: 'puzzled_session',
			value,
			url: baseURL ?? 'http://localhost:3000',
			httpOnly: true,
		})
		if (scenario !== 'guest run') await context.addCookies([cookie('fixture-player-a')])
		await page.route('**/v1/guest/session', (route) =>
			route.fulfill({
				json: { issued: scenario === 'guest run' },
				headers:
					scenario === 'guest run'
						? { 'Set-Cookie': '__Host-puzzled_guest=fixture-guest; Secure; HttpOnly; Path=/' }
						: undefined,
			}),
		)
		await page.route('**/puzzled.v1.PuzzleService/GetDaily', (route) =>
			route.fulfill({
				json: {
					gameSlug: 'word-guess',
					puzzleDate,
					puzzleId,
					canPlay: true,
					puzzleDataJson: JSON.stringify({ wordLength: 5, maxAttempts: 6 }),
				},
			}),
		)
		await page.route('**/puzzled.v1.PuzzleService/CheckGuess', async (route) => {
			guesses.push(route.request().postDataJSON())
			if (guesses.length === 1) {
				received.resolve()
				await release.promise
			}
			await route.fulfill({
				json: {
					resultJson: JSON.stringify({
						tiles: ['absent', 'present', 'correct', 'absent', 'absent'],
					}),
				},
			})
			acknowledged.resolve()
		})
		await page.route('**/puzzled.v1.PuzzleService/SubmitGuess', (route) => {
			finishes.push(route.request().postDataJSON())
			return route.fulfill({ json: { valid: false } })
		})

		const board = page.getByRole('table', { name: 'Five' })
		const row = (index: number) => board.locator('tr').nth(index)
		const letter = (index: number) => row(0).locator('td').nth(index)
		const expectInitialRequestOnly = () =>
			expect(guesses).toEqual([
				{
					gameSlug: 'word-guess',
					puzzleDate: today,
					puzzleId: firstPuzzleId,
					guessJson: '{"word":"crane"}',
				},
			])
		const sync = page.getByText('Syncing...', { exact: true })
		const visitGames = async () => {
			await page.locator('#play').getByRole('link', { name: 'Games', exact: true }).click()
			await expect(page).toHaveURL(/\/games$/)
			await expect(board).toHaveCount(0)
		}
		const goBack = async () => {
			await page.goBack()
			await expect(page).toHaveURL(/\/games\/word-guess\?start=1#play$/)
			await expect(board).toBeVisible()
		}
		await page.goto(fivePath)
		const decline = page.getByRole('button', { name: 'Decline', exact: true })
		if (await decline.isVisible()) await decline.click()
		await expect(board).toBeVisible()
		await page.keyboard.press('c')
		await page.keyboard.press('r')
		await page.keyboard.press('a')
		await page.keyboard.press('n')
		await page.keyboard.press('e')
		await page.keyboard.press('Enter')
		await received.promise
		await expect(sync).toBeVisible()
		await expect(board.locator('[data-active-slot]')).toHaveCount(0)
		expectInitialRequestOnly()
		try {
			await visitGames()
			if (scenario === 'other account') await context.addCookies([cookie('fixture-player-b')])
			if (scenario === 'other day') puzzleDate = productDayKey(new Date(now.getTime() - 86_400_000))
			if (scenario === 'other puzzle') puzzleId = otherPuzzleId
			await goBack()

			if (restore) {
				await expect(sync).toBeVisible()
				await expect(letter(0)).toHaveText('C')
				await expect(letter(4)).toHaveText('E')
				await expect(row(0).locator('[data-grade]')).toHaveCount(0)
				await page.keyboard.press('Enter')
				expectInitialRequestOnly()
				// Resolve while unmounted as well, then read back the settled result.
				await visitGames()
			}
			release.resolve()
			await acknowledged.promise
			if (restore) {
				await goBack()
				await expect(row(0).locator('[data-grade]')).toHaveCount(5)
				await expect(letter(1)).toHaveAttribute('data-grade', 'present')
				await expect(letter(2)).toHaveAttribute('data-grade', 'correct')
				await expect(row(1)).toHaveAttribute('data-current', '')
				await expect(row(1).locator('td').first()).toHaveAttribute('data-active-slot', 'true')
			} else {
				await expect(page.locator('[data-game-stage="board"] fieldset')).toHaveAttribute(
					'aria-busy',
					'false',
				)
				await expect(letter(0)).toBeEmpty()
				await expect(board.locator('[data-grade]')).toHaveCount(0)
			}
			await expect(sync).toBeHidden()
			expectInitialRequestOnly()
			expect(finishes).toEqual([])
		} finally {
			release.resolve()
		}
	})
}

for (const { route, localTheme, englishTheme } of [
	{ route: '/games/word-search', localTheme: '音樂', englishTheme: 'Music' },
]) {
	test(`Taiwan board localizes the fixture theme on ${route} without changing English`, async ({
		page,
		baseURL,
	}) => {
		requireLocalFixture(baseURL)
		const board = page.locator('[data-game-stage="board"]')
		await page.goto(`/zh-TW${route}`)
		await expect(board.getByText(localTheme, { exact: true })).toBeVisible()
		await expect(board.getByText(englishTheme, { exact: true })).toHaveCount(0)
		await page.goto(route)
		await expect(board.getByText(englishTheme, { exact: true })).toBeVisible()
	})
}

function overlaps(a: DOMRect, b: DOMRect) {
	return a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top
}

async function expectFinishTypography(card: Locator, hasPractice: boolean, phone: boolean) {
	const next = card.getByRole('link', { name: /^Play next:/ })
	const secondary = card.locator('.result-action-row').locator('a, button')
	await expect(secondary).toHaveCount(hasPractice ? 3 : 2)
	const controls = [
		next,
		...(await secondary.all()),
		card.getByRole('link', { name: 'Create a free account', exact: true }),
		card.locator('[data-install-nudge]').getByRole('button', { name: 'Dismiss', exact: true }),
	]
	const elements = [
		card.locator('.completion-heading h2'),
		card.locator('[data-result-percentile]'),
		card.locator('[data-result-milestone="7"]'),
		...controls,
	]
	const boxes = await Promise.all(
		elements.map((locator) =>
			locator.evaluate((el) => el.getBoundingClientRect().toJSON() as DOMRect),
		),
	)
	for (const [index, box] of boxes.entries()) {
		for (const other of boxes.slice(index + 1)) expect(overlaps(box, other)).toBe(false)
	}

	for (const action of controls) {
		const words = await action.evaluate((el) => {
			const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT)
			const range = document.createRange()
			const layout: { word: string; lines: number[] }[] = []
			for (let node = walker.nextNode(); node; node = walker.nextNode()) {
				for (const match of (node.textContent ?? '').matchAll(/\S+/g)) {
					range.setStart(node, match.index)
					range.setEnd(node, match.index + match[0].length)
					const lines = Array.from(range.getClientRects(), (rect) => Math.round(rect.top))
					if (lines.length) layout.push({ word: match[0], lines: [...new Set(lines)] })
				}
			}
			return layout
		})
		// An icon-only Dismiss has no visible text. Each other label must occupy
		// no more lines than it has words, and no individual word can split.
		if ((await action.getAttribute('aria-label')) === 'Dismiss') continue
		expect(words.length).toBeGreaterThan(0)
		expect(new Set(words.flatMap(({ lines }) => lines)).size).toBeLessThanOrEqual(words.length)
		for (const { word, lines } of words) expect(lines, word).toHaveLength(1)
	}

	if (phone) {
		const contentWidth = await card.evaluate((el) => {
			const { paddingLeft, paddingRight } = getComputedStyle(el)
			return el.clientWidth - parseFloat(paddingLeft) - parseFloat(paddingRight)
		})
		expect((await next.boundingBox())!.width).toBeGreaterThanOrEqual(contentWidth * 0.9)
	}
}

for (const viewport of [
	{ width: 1440, height: 900 },
	{ width: 390, height: 844 },
]) {
	test.describe(`${viewport.width}×${viewport.height}`, () => {
		if (viewport.width === 390) {
			const { userAgent } = devices['iPhone 13']
			test.use({ viewport, userAgent, isMobile: true, hasTouch: true, deviceScaleFactor: 2 })
		} else {
			test.use({ viewport })
		}

		for (const slug of ['word-guess', 'sudoku', 'crossword'] as const) {
			test(`${slug} guest finish fits without moving the board`, async ({
				page,
				baseURL,
			}, info) => {
				requireLocalFixture(baseURL)
				const dayKey = productDayKey()
				const next = 'crowns'
				const puzzleData = {
					'word-guess': { wordLength: 5, maxAttempts: 6 },
					sudoku: {
						grid: Array.from({ length: 9 }, (_, r) =>
							Array.from({ length: 9 }, (_, c) =>
								r === 8 && c === 8 ? null : ((r * 3 + Math.floor(r / 3) + c) % 9) + 1,
							),
						),
						difficulty: 'easy',
					},
					crossword: {
						grid: [['', '', '', '', ''], ...Array.from({ length: 4 }, () => Array(5).fill(null))],
						clues: {
							across: [{ number: 1, row: 0, col: 0, length: 5, clue: 'Pleasant' }],
							down: [],
						},
					},
				}[slug]
				await page.emulateMedia({ reducedMotion: 'reduce' })
				await page.route('**/v1/guest/session', (route) =>
					route.fulfill({ json: { issued: true } }),
				)
				await page.route('**/puzzled.v1.PuzzleService/GetDaily', (route) =>
					route.fulfill({
						json: {
							gameSlug: slug,
							puzzleId: firstPuzzleId,
							puzzleDate: dayKey,
							canPlay: true,
							puzzleDataJson: JSON.stringify(puzzleData),
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
				await page.route('**/puzzled.v1.PuzzleService/CheckGuess', (route) => {
					const { word } = JSON.parse(route.request().postDataJSON().guessJson)
					const tiles =
						word === 'charm'
							? ['correct', 'present', 'absent', 'absent', 'absent']
							: Array(5).fill('correct')
					return route.fulfill({ json: { resultJson: JSON.stringify({ tiles }) } })
				})
				await page.route('**/puzzled.v1.PuzzleService/SubmitGuess', (route) =>
					route.fulfill({ json: { gameSlug: slug, valid: true, status: 'won', score: 487 } }),
				)
				await page.route('**/puzzled.v1.StatsService/GetTodayPercentile', (route) =>
					route.fulfill({ json: { gameSlug: slug, dayKey, percentile: 73, totalPlayers: 15 } }),
				)
				await page.route('**/puzzled.v1.GamificationService/GetStreakInfo', (route) =>
					route.fulfill({ json: { info: { currentStreak: 7 } } }),
				)
				await page.setExtraHTTPHeaders({ 'CF-IPCountry': 'DE' })
				const difficulty = slug === 'sudoku' ? 'difficulty=easy&' : ''
				await page.goto(`/en-US/games/${slug}?${difficulty}start=1#play`)
				const decline = page.getByRole('button', { name: 'Decline', exact: true })
				await decline.click()
				const board =
					slug === 'word-guess'
						? page.getByRole('table', { name: 'Five' })
						: page.locator('.play-body .play-board')
				await expect(board).toBeVisible()
				await page.evaluate(() => document.fonts.ready)
				if (viewport.width !== 390) {
					// A loopback build is not installable; exercise the captured Chromium event.
					await page.evaluate(() =>
						window.dispatchEvent(new Event('beforeinstallprompt', { cancelable: true })),
					)
				}
				const cue = page.locator('[data-first-action]')
				await expect(cue).toBeVisible()
				const bounds = (locator: Locator) =>
					locator.evaluate((el) => el.getBoundingClientRect().toJSON() as DOMRect)
				const before = await bounds(board)
				if (slug === 'word-guess') {
					for (const [index, word] of ['charm', 'couch'].entries()) {
						await page.keyboard.type(word)
						await page.keyboard.press('Enter')
						await expect(board.locator('tr').nth(index).locator('[data-grade]')).toHaveCount(5)
					}
				} else if (slug === 'sudoku') {
					await board.getByRole('button', { name: 'Row 9, Column 9', exact: true }).click()
					await page.keyboard.press('8')
				} else {
					await board.locator('[data-crossword-cell]').first().click()
					await page.keyboard.type('NICER')
					await page.getByRole('button', { name: 'Check', exact: true }).click()
				}

				const card = page.locator('.completion-card[data-board-finished]')
				const actions = [
					card.getByRole('link', { name: /^Play next:/ }),
					card.getByRole('button', { name: 'Copy challenge', exact: true }),
					card.getByText(/^Create a free account to keep your streak/),
					card.getByRole('link', { name: 'Create a free account', exact: true }),
					card.getByRole('complementary', { name: 'Add Tryit to your Home Screen', exact: true }),
				]
				for (const action of actions) await expect(action).toBeVisible()
				await expect(card.locator('[data-result-percentile]')).toBeVisible()
				await expect(card.locator('[data-result-milestone="7"]')).toBeVisible()
				const after = await bounds(board)
				const panel = await bounds(card)
				const size = await card.evaluate(({ scrollHeight, clientHeight }) => ({
					scrollHeight,
					clientHeight,
				}))
				await page.screenshot({ path: info.outputPath(`${slug}.png`) })
				await info.attach('finish geometry', {
					body: JSON.stringify({ slug, viewport, before, after, panel, size }),
					contentType: 'application/json',
				})
				expect(size.scrollHeight).toBeLessThanOrEqual(size.clientHeight + 1)
				await expect(cue).toBeHidden()
				for (const key of ['x', 'y', 'width', 'height'] as const) {
					expect(Math.abs(after[key] - before[key])).toBeLessThanOrEqual(1)
				}
				const played = board.locator('tr').filter({ has: page.locator('[data-grade]') })
				let protectedBoard = after
				if (slug === 'word-guess' && viewport.width === 390) {
					await expect(played).toHaveCount(2)
					protectedBoard = await bounds(played.last())
				}
				expect(overlaps(panel, protectedBoard)).toBe(false)
				await expectFinishTypography(card, slug !== 'crossword', viewport.width === 390)
				for (const locator of [board, card, ...actions]) {
					const rect = await bounds(locator)
					expect(rect.top).toBeGreaterThanOrEqual(0)
					expect(rect.bottom).toBeLessThanOrEqual(viewport.height)
					expect(rect.left).toBeGreaterThanOrEqual(0)
					expect(rect.right).toBeLessThanOrEqual(viewport.width)
					await expect(locator).toBeInViewport({ ratio: 0.99 })
				}
				for (const action of actions) {
					expect(
						await action.evaluate((el) => {
							const { left, top, width, height } = el.getBoundingClientRect()
							return el.contains(document.elementFromPoint(left + width / 2, top + height / 2))
						}),
					).toBe(true)
				}
			})
		}
	})
}
