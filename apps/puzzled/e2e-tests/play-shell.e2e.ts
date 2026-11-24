import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { expect, type Page, test } from '@playwright/test'
import { productDayKey } from '../src/lib/product-day'
import { capture } from './google-tag-support'

const wordGames = [
	'word-guess',
	'quad-words',
	'word-ladder',
	'word-groups',
	'word-search',
	'cryptogram',
	'word-box',
	'word-hive',
	'crossword',
]
const otherGames = [
	'number-path',
	'nonogram',
	'sudoku',
	'block-slide',
	'killer-sudoku',
	'pattern-match',
	'crowns',
	'duo',
	'arithmo',
	'pip-place',
]
const hasLevels = new Set(['sudoku', 'nonogram', 'block-slide', 'crowns', 'killer-sudoku'])
const stage = '[data-game-stage="board"]'
const cue = '[data-first-action]'

function playable(slug: string) {
	const snapshot = {
		gameSlug: slug,
		puzzleDate: productDayKey(),
		canPlay: true,
		puzzleId: '11a198bc-8079-4830-8c07-0d397aaabc73',
	}
	if (slug === 'word-groups') {
		return {
			...snapshot,
			puzzleDataJson: JSON.stringify({
				words:
					'APPLE BANANA ORANGE GRAPE RED BLUE GREEN YELLOW MARS VENUS SATURN JUPITER HEART DIAMOND CLUB SPADE'.split(
						' ',
					),
				maxMistakes: 4,
				wordsPerCategory: 4,
				totalCategories: 4,
			}),
		}
	}
	const cases = JSON.parse(
		readFileSync(
			resolve(__dirname, `../../../crates/puzzled-core/tests/fixtures/generate/${slug}.json`),
			'utf8',
		),
	)
	const entry = cases.find(
		(c: { difficulty: string | null; puzzleData?: unknown }) =>
			c.puzzleData !== undefined && (!hasLevels.has(slug) || c.difficulty === 'medium'),
	)
	const puzzleData =
		slug === 'word-search' ? { ...entry.puzzleData, words: entry.solution.words } : entry.puzzleData
	return { ...snapshot, puzzleDataJson: JSON.stringify(puzzleData) }
}

async function openBoard(page: Page, slug: string, locale = 'en-US') {
	const snapshot = playable(slug)
	await page.route('**/puzzled.v1.PuzzleService/GetDaily', (route) =>
		route.fulfill({ json: snapshot }),
	)
	await page.setExtraHTTPHeaders({ 'CF-IPCountry': 'DE' })
	const query = hasLevels.has(slug) ? 'difficulty=medium&start=1' : 'start=1'
	await page.goto(`/${locale}/games/${slug}?${query}#play`)
	await expect(page.locator(stage), slug).toBeVisible()
}

async function checkHelp(page: Page, label: string) {
	const play = page.locator('#play')
	const help = play.getByRole('button', { name: label, exact: true })
	await expect(help).toHaveCount(1)
	await expect(play.locator('a, summary').filter({ hasText: /how to play|玩法/i })).toHaveCount(0)
	const url = page.url()
	await help.click()
	const dialog = play.getByRole('dialog', { name: label })
	await expect(dialog).toBeVisible()
	await expect(dialog.getByRole('listitem').first()).toBeVisible()
	await page.keyboard.press('Escape')
	await expect(dialog).toBeHidden()
	await expect(help).toBeFocused()
	await expect(page).toHaveURL(url)
}

const splitGames = [
	'killer-sudoku',
	'nonogram',
	'block-slide',
	'sudoku',
	'quad-words',
	'number-path',
	'pip-place',
	'crossword',
]
const layouts = [
	[1280, 803],
	[1440, 900],
	[1920, 937],
	[390, 844],
]

async function canvasGeometry(page: Page) {
	return page.locator('[data-play-canvas]').evaluate((canvas) => {
		const dock = document.querySelector('[data-consent-banner]')!
		const dockRect = dock.getBoundingClientRect()
		const shell = canvas.closest('.site-shell')!
		const body = canvas.querySelector('.play-body')!
		const controls = [...canvas.querySelectorAll('button, a, input, summary')].filter(
			(el) =>
				el.getClientRects().length &&
				!el.closest('dialog:not([open]), details:not([open]) > :not(summary)'),
		)
		const bad = controls.flatMap((el) => {
			const r = el.getBoundingClientRect()
			const hit = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2)
			return r.bottom <= dockRect.top && el.contains(hit)
				? []
				: [el.getAttribute('aria-label') || el.textContent]
		})
		const choices = [...dock.querySelectorAll('button')].map((el) => {
			const { width, height } = el.getBoundingClientRect()
			return JSON.stringify([el.className, Math.round(width), Math.round(height)])
		})
		return {
			bad,
			inFlow: getComputedStyle(dock).position === 'static',
			frameless:
				getComputedStyle(canvas).borderWidth === '0px' &&
				getComputedStyle(canvas).boxShadow === 'none',
			fillsViewport: shell.getBoundingClientRect().height === innerHeight,
			equalChoices: choices.length === 3 && new Set(choices).size === 1,
			overflow: [document.documentElement, shell, body].map((el) => [
				el.scrollWidth - el.clientWidth,
				el.scrollHeight - el.clientHeight,
				el.scrollTop,
			]),
		}
	})
}

for (const [width, height] of layouts) {
	test.describe(width + '×' + height, () => {
		test.use({ viewport: { width, height }, hasTouch: width === 390, isMobile: width === 390 })
		for (const [locale, slugs] of [
			['en-US', [...wordGames, ...otherGames]],
			['zh-TW', ['nonogram', 'number-path', 'quad-words', 'block-slide']],
		] as const) {
			for (const slug of slugs) {
				test(slug + ' fits the frameless play canvas (' + locale + ')', async ({ page }) => {
					await openBoard(page, slug, locale)
					const dock = page.locator('[data-consent-banner]')
					await expect(dock.getByRole('button')).toHaveText(
						locale === 'en-US'
							? ['Decline', 'Accept', 'Analytics only']
							: ['拒絕', '接受', '僅限分析'],
					)
					await page.evaluate(() => document.fonts.ready)
					await expect(page.locator(cue)).toBeInViewport({ ratio: 1 })
					if (slug === 'quad-words') {
						const keyboard = page.locator('[data-key="Enter"]')
						const before = await keyboard.boundingBox()
						await page.keyboard.type('ZZZZZ')
						await page.keyboard.press('Enter')
						await expect(page.locator('[data-quad-board]').getByRole('alert')).toHaveText(
							locale === 'en-US' ? 'Not in word list' : '不在詞庫中',
						)
						expect(await keyboard.boundingBox()).toEqual(before)
					}
					expect(await canvasGeometry(page)).toEqual({
						bad: [],
						inFlow: true,
						frameless: true,
						fillsViewport: true,
						equalChoices: true,
						overflow: [
							[0, 0, 0],
							[0, 0, 0],
							[0, 0, 0],
						],
					})
					if (width >= 1024 && splitGames.includes(slug)) {
						const board = (await page.locator('.play-board').boundingBox())!
						const tools = (await page.locator('.play-tools').boundingBox())!
						expect(board.x + board.width).toBeLessThan(tools.x)
					}
					if (width >= 1024 && splitGames.includes(slug)) {
						const instruction = await page.locator(cue).evaluate((el) => {
							const range = document.createRange()
							range.selectNodeContents(el)
							const lines = new Set(Array.from(range.getClientRects(), (rect) => rect.top))
							return { width: el.getBoundingClientRect().width, lines: lines.size }
						})
						expect(instruction.width).toBeGreaterThanOrEqual(220)
						expect(instruction.lines).toBeGreaterThan(0)
						expect(instruction.lines).toBeLessThanOrEqual(2)
					}
					if (width >= 1024 && slug === 'killer-sudoku') {
						const dockTop = (await dock.boundingBox())!.y
						const buttons = await page
							.locator('.play-tools button')
							.evaluateAll((els) => els.map((el) => el.getBoundingClientRect().bottom))
						expect(buttons).toHaveLength(13)
						expect(dockTop - Math.max(...buttons)).toBeGreaterThanOrEqual(18)
					}
					if (slug === 'nonogram') {
						await checkHelp(page, locale === 'en-US' ? 'How to play' : '玩法')
						const play = page.locator('#play')
						const before = (await play.boundingBox())!.height
						await dock.getByRole('button').first().click()
						await expect(dock).toHaveCount(0)
						expect((await play.boundingBox())!.height).toBeGreaterThan(before)
					}
				})
			}
		}
	})
}

test('all 19 games show one rules dialog and introductory copy in zh-TW', async ({ page }) => {
	await page.setViewportSize({ width: 390, height: 844 })
	for (const slug of [...wordGames, ...otherGames]) {
		await openBoard(page, slug, 'zh-TW')
		await expect(page.locator(cue), slug).toHaveText(/\p{Script=Han}/u)
		const notice = page.locator('[data-english-word-puzzle]')
		if (wordGames.includes(slug)) await expect(notice, slug).toHaveText('英文單字謎題')
		else await expect(notice, slug).toHaveCount(0)
		await checkHelp(page, '玩法')
		await page.unroute('**/puzzled.v1.PuzzleService/GetDaily')
	}
})

for (const admitted of [true, false]) {
	test(
		'cold Play today tap sends one start and ' +
			(admitted ? 'opens the board' : 'honors the limit'),
		async ({ page }) => {
			const slug = 'number-path'
			const data = playable(slug)
			const starts: unknown[] = []
			await page.route('**/v1/guest/session', (route) => route.fulfill({ json: { issued: true } }))
			await page.route('**/puzzled.v1.PuzzleService/GetDaily', (route) =>
				route.fulfill({
					json: {
						gameSlug: slug,
						puzzleDate: data.puzzleDate,
						canPlay: true,
						requiresStart: true,
					},
				}),
			)
			await page.route('**/puzzled.v1.PuzzleService/StartDaily', (route) => {
				starts.push(route.request().postDataJSON())
				return admitted
					? route.fulfill({ json: { daily: data } })
					: route.fulfill({
							status: 403,
							json: { code: 'permission_denied', message: 'plus_required' },
						})
			})
			const held = Promise.withResolvers<void>()
			const requested = Promise.withResolvers<void>()
			await page.route('**/_build/**/*.js', async (route) => {
				requested.resolve()
				await held.promise
				await route.continue().catch(() => undefined) // leaving the first document cancels its scripts
			})
			try {
				await page.goto(`/games/${slug}`, { waitUntil: 'commit' })
				await requested.promise
				const play = page.getByRole('link', { name: "Play today's puzzle", exact: true }).first()
				await expect(play).toBeVisible()
				await play.click({ noWaitAfter: true })
				await expect(page).toHaveURL(/\?start=1#play$/)
			} finally {
				held.resolve()
			}
			await expect(page.locator(admitted ? stage : '[data-unlock-panel="picks"]')).toBeVisible()
			await expect(page.locator('[data-game-stage="start"]')).toHaveCount(0)
			expect(starts).toEqual([
				expect.objectContaining({ gameSlug: slug, puzzleDate: data.puzzleDate }),
			])
			if (admitted) {
				// The next passive visit to the same URL must not spend another pick.
				await page.reload()
				await expect(page.locator('[data-game-stage="start"] button')).toBeEnabled()
				expect(starts).toHaveLength(1)
			}
		},
	)
}

// Flush painted frames (not just a DOM mutation) before releasing each dependency.
async function twoFrames(page: Page) {
	await page.evaluate(
		() =>
			new Promise<void>((resolve) =>
				requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
			),
	)
}

function holdResponse(page: Page, url: string | RegExp, json?: unknown) {
	const release = Promise.withResolvers<void>()
	const requested = Promise.withResolvers<void>()
	const registered = page.route(url, async (route) => {
		requested.resolve()
		await release.promise
		if (json === undefined) await route.continue()
		else await route.fulfill({ json })
	})
	return { registered, requested: requested.promise, release: release.resolve }
}

for (const [width, height] of [
	[1440, 900],
	[390, 844],
]) {
	for (const slug of ['number-path', 'sudoku']) {
		const fresh = slug === 'number-path'
		test(`${fresh ? 'fresh Path entry' : 'resumed Sudoku'} keeps a stable play stage at ${width}×${height}`, async ({
			page,
		}, info) => {
			await page.setViewportSize({ width, height })
			await page.setExtraHTTPHeaders({ 'CF-IPCountry': 'DE' })
			await page.addInitScript(() => {
				const values: number[] = []
				new PerformanceObserver((list) => {
					for (const entry of list.getEntries() as (PerformanceEntry & {
						value: number
						hadRecentInput: boolean
					})[]) {
						if (!entry.hadRecentInput) values.push(entry.value)
					}
				}).observe({ type: 'layout-shift', buffered: true })
				Object.defineProperty(window, 'observedShifts', { value: values })
			})
			const daily = playable(slug)
			const snapshot = holdResponse(
				page,
				'**/puzzled.v1.PuzzleService/GetDaily',
				fresh
					? {
							gameSlug: slug,
							puzzleDate: daily.puzzleDate,
							canPlay: true,
							requiresStart: true,
						}
					: daily,
			)
			const lazyBoard = holdResponse(page, /\/_build\/assets\/solid-board-[^/]+\.js$/)
			const start = fresh
				? holdResponse(page, '**/puzzled.v1.PuzzleService/StartDaily', { daily })
				: undefined
			await Promise.all([snapshot.registered, lazyBoard.registered, start?.registered])
			await page.route('**/v1/guest/session', (route) => route.fulfill({ json: { issued: true } }))
			const play = page.locator('#play')
			const dock = page.locator('[data-consent-banner]')
			const loading = play.getByRole('status').filter({ hasText: /loading/i })
			const geometry = async () => {
				await twoFrames(page)
				return { stage: await play.boundingBox(), dock: await dock.boundingBox() }
			}
			try {
				await page.goto(`/games/${slug}?start=1${fresh ? '' : '&difficulty=medium'}#play`)
				await snapshot.requested
				await expect(loading).toBeVisible()
				await expect(dock).toBeVisible()
				await page.evaluate(() => document.fonts.ready.then(() => undefined))
				const initial = await geometry()
				snapshot.release()
				if (start) {
					const playButton = play.getByRole('button', { name: 'Play', exact: true })
					await expect(playButton).toBeEnabled()
					expect(await geometry(), 'entry gate').toEqual(initial)
					await playButton.click()
					await start.requested
					await expect(playButton).toBeDisabled()
					expect(await geometry(), 'pending start').toEqual(initial)
					// Release the board after the recent-input exclusion window, so
					// its mount cannot be hidden by the click in Chromium's CLS data.
					const deadline = await page.evaluate(() => performance.now() + 500)
					await page.waitForFunction((end) => performance.now() > end, deadline)
					start.release()
				}
				await lazyBoard.requested
				await expect(loading).toBeVisible()
				expect(await geometry(), 'board chunk pending').toEqual(initial)
				lazyBoard.release()
				const board = page.locator(`${stage} .play-board`)
				await expect(board).toBeVisible()
				await expect(loading).toHaveCount(0)
				expect(await geometry(), 'board rendered').toEqual(initial)
				const shifts = await page.evaluate(
					() => (window as unknown as { observedShifts: number[] }).observedShifts,
				)
				// Summing the whole transition is stricter than CLS's largest session window.
				const cls = shifts.reduce((sum, value) => sum + value, 0)
				await info.attach('non-input layout shifts', {
					body: JSON.stringify({ cls, shifts }),
					contentType: 'application/json',
				})
				expect(cls).toBeLessThan(0.05)
			} finally {
				snapshot.release()
				if (start) start.release()
				lazyBoard.release()
			}
		})
	}
}

const reloadSolution = Array.from({ length: 9 }, (_, r) =>
	Array.from({ length: 9 }, (_, c) => {
		const digit = ((r * 3 + Math.floor(r / 3) + c) % 9) + 1
		return digit === 8 ? 6 : digit === 6 ? 8 : digit
	}),
)

for (const [width, height] of [
	[1440, 900],
	[390, 844],
]) {
	test(`guest Sudoku survives both reloads before consent at ${width}×${height}`, async ({
		page,
		context,
	}) => {
		await page.setViewportSize({ width, height })
		await page.setExtraHTTPHeaders({ 'CF-IPCountry': 'DE' })
		const google = await capture(page)
		await page.addInitScript(() => {
			const shifts: number[] = []
			new PerformanceObserver((list) => {
				for (const entry of list.getEntries() as (PerformanceEntry & {
					value: number
					hadRecentInput: boolean
				})[]) {
					if (!entry.hadRecentInput) shifts.push(entry.value)
				}
			}).observe({ type: 'layout-shift', buffered: true })
			Object.defineProperty(window, 'observedShifts', { value: shifts })
		})
		const blank = [
			[2, 1],
			[8, 7],
			[8, 8],
		]
		const daily = {
			...playable('sudoku'),
			difficulty: 'medium',
			puzzleDataJson: JSON.stringify({
				difficulty: 'medium',
				grid: reloadSolution.map((row, r) =>
					row.map((v, c) => (blank.some(([br, bc]) => br === r && bc === c) ? null : v)),
				),
			}),
		}
		let starts = 0
		let finished = false
		await page.route('**/v1/guest/session', (route) => route.fulfill({ json: { issued: true } }))
		await page.route('**/puzzled.v1.PuzzleService/GetDaily', (route) =>
			route.fulfill({
				json: starts
					? daily
					: {
							gameSlug: 'sudoku',
							puzzleDate: daily.puzzleDate,
							canPlay: true,
							requiresStart: true,
						},
			}),
		)
		await page.route('**/puzzled.v1.PuzzleService/StartDaily', (route) => {
			expect(route.request().postDataJSON()).toMatchObject({
				gameSlug: 'sudoku',
				difficulty: 'medium',
				puzzleDate: daily.puzzleDate,
			})
			starts++
			return route.fulfill({ json: { daily } })
		})
		await page.route('**/puzzled.v1.PuzzleService/SubmitGuess', (route) => {
			const body = route.request().postDataJSON()
			expect(body).toMatchObject({ status: 'won', puzzleId: daily.puzzleId, difficulty: 'medium' })
			expect(JSON.parse(body.submissionJson)).toMatchObject({ finalGrid: reloadSolution })
			expect(Number(body.timeSpentMs)).toBeGreaterThanOrEqual(3_100)
			finished = true
			return route.fulfill({ json: { valid: true, status: 'won', score: 900, gameSlug: 'sudoku' } })
		})
		await page.goto('/')
		expect(await context.cookies()).toEqual([])
		const banner = page.locator('[data-consent-banner]')
		await expect(banner).toBeVisible()
		const hero = page.getByRole('link', { name: "Play today's Sudoku", exact: true })
		// The daily hero rotates on the server calendar. On other days, the
		// Sudoku Home tile uses the same one-tap intent and medium play route.
		await ((await hero.count()) ? hero : page.locator('[data-home-game="sudoku"]')).click()
		await expect(page).toHaveURL(/\/games\/sudoku\?difficulty=medium&start=1#play$/)
		const board = page.getByRole('group', { name: 'Sudoku', exact: true })
		const move = board.getByRole('button', { name: 'Row 3, Column 2, 6', exact: true })
		const notes = board.getByRole('button', { name: 'Row 9, Column 8', exact: true })
		const digit = (value: number) =>
			page.locator('.play-tools').getByRole('button', { name: String(value), exact: true })
		await board.getByRole('button', { name: 'Row 3, Column 2', exact: true }).click()
		await digit(6).click()
		await expect(move).toHaveText('6')
		await notes.click()
		await page.getByRole('button', { name: 'Notes', exact: true }).click()
		await digit(4).click()
		await expect(notes.locator('[data-visible]')).toHaveText('4')
		await expect
			.poll(() =>
				page.evaluate(() =>
					Object.keys(sessionStorage).some((key) => key.startsWith('puzzled:play-draft:v1:')),
				),
			)
			.toBe(true)
		await page.evaluate(() => document.fonts.ready.then(() => undefined))
		const geometry = await page.locator('#play').boundingBox()
		const cdp = await context.newCDPSession(page)
		// Real elapsed time is part of the assertion, not a save debounce.
		await new Promise((resolve) => setTimeout(resolve, 3_100))
		for (const bypass of [false, true]) {
			if (bypass) {
				const loaded = page.waitForEvent('domcontentloaded')
				await cdp.send('Page.reload', { ignoreCache: true })
				await loaded
			} else await page.reload()
			await expect(move).toHaveText('6')
			await expect(notes.locator('[data-visible]')).toHaveText('4')
			await expect(banner).toBeVisible()
			await page.evaluate(() => document.fonts.ready.then(() => undefined))
			await twoFrames(page)
			expect(await page.locator('#play').boundingBox()).toEqual(geometry)
			const cls = await page.evaluate(() =>
				(window as unknown as { observedShifts: number[] }).observedShifts.reduce(
					(sum, value) => sum + value,
					0,
				),
			)
			expect(cls).toBeLessThan(0.05)
		}
		expect(starts).toBe(1)
		await page.getByRole('button', { name: 'Undo', exact: true }).click()
		await expect(notes.locator('[data-visible]')).toHaveCount(0)
		await expect(move).toHaveText('6')
		await page.locator('.play-tools button[aria-pressed="true"]').click()
		for (const [r, c] of blank.slice(1)) {
			await board
				.getByRole('button', { name: `Row ${r + 1}, Column ${c + 1}`, exact: true })
				.click()
			await digit(reloadSolution[r][c]).click()
		}
		await page.getByRole('button', { name: 'See your result', exact: true }).click()
		await expect(page.locator('dialog:modal').filter({ hasText: 'Sudoku Complete' })).toBeVisible()
		expect(finished).toBe(true)
		await expect(banner).toBeVisible()
		expect(google).toEqual([])
		expect(await context.cookies()).toEqual([])
		const storage = await page.evaluate(async () => ({
			local: Object.keys(localStorage).sort(),
			session: Object.keys(sessionStorage),
			idb: (await indexedDB.databases()).map(({ name }) => name),
		}))
		expect(storage).toEqual({
			local: [`puzzled:picks:${daily.puzzleDate}`, 'puzzled:pwa:first-finish-day'],
			session: [],
			idb: [],
		})
	})
}

test('Path also restores a move, but not onto a different served puzzle', async ({ page }) => {
	const daily = playable('number-path')
	await page.route('**/puzzled.v1.PuzzleService/GetDaily', (route) =>
		route.fulfill({ json: daily }),
	)
	await page.goto('/games/number-path?start=1#play')
	const path = page.locator('[data-number-path-board]')
	const clue = path.getByRole('button', { name: /, Clue 1$/ }).first()
	await clue.click()
	await expect(clue).toHaveAttribute('aria-pressed', 'true')
	await page.reload()
	await expect(clue).toHaveAttribute('aria-pressed', 'true')
	daily.puzzleId = 'f5477d51-a783-48bc-98e0-c37620319042'
	await page.reload()
	await expect(clue).toHaveAttribute('aria-pressed', 'false')
})
