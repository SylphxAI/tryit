import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { expect, type Page } from '@playwright/test'
import { START_INTENT_TTL_MS } from '../src/features/daily/lib/start-intent'
import { gamePath } from '../src/lib/game-slug'
import { productDayKey } from '../src/lib/product-day'
import { START_INTENT_KEY } from '../src/lib/storage-keys'
import { googleTagTest as test } from './google-tag-support'

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

function playable(slug: string, difficulty = 'medium') {
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
			c.puzzleData !== undefined && (!hasLevels.has(slug) || c.difficulty === difficulty),
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
	await page.goto(`/${locale}${gamePath(slug)}?${query}#play`)
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
			const quote = el.closest('[data-cipher-quote]')
			if (quote && quote.scrollHeight > quote.clientHeight) {
				const scrollport = quote.getBoundingClientRect()
				// Clipped letters are verified separately by focusing the final tile.
				if (r.top < scrollport.top || r.bottom > scrollport.bottom) return []
			}
			const hit = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2)
			return r.bottom <= dockRect.top && el.contains(hit)
				? []
				: [el.getAttribute('aria-label') || el.textContent]
		})
		const choices = [...dock.querySelectorAll('[data-consent-choices] button')].map((el) => {
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

for (const [width, height] of [
	[1440, 900],
	[390, 844],
]) {
	for (const colorScheme of ['light', 'dark'] as const) {
		test.describe(`${width}×${height} ${colorScheme}`, () => {
			test.use({
				viewport: { width, height },
				colorScheme,
				hasTouch: width === 390,
				isMobile: width === 390,
			})
			test('Arithmo amber cursor advances without shifting any of the 48 cells', async ({
				page,
			}, testInfo) => {
				await openBoard(page, 'arithmo')
				const board = page.locator('[data-arithmo-board]')
				const tiles = board.locator('[data-arithmo-grid] [data-grade]')
				const cursor = board.locator('[data-active-slot]')
				await expect(tiles).toHaveCount(48)
				await expect(
					page.locator(colorScheme === 'dark' ? 'html.dark' : 'html:not(.dark)'),
				).toHaveCount(1)
				await page.evaluate(() => document.fonts.ready)
				const bounds = () =>
					tiles.evaluateAll((cells) => cells.map((cell) => cell.getBoundingClientRect().toJSON()))
				const before = await bounds()
				const expectGeometry = async () => {
					expect(await bounds()).toEqual(before)
					expect((await canvasGeometry(page)).overflow).toEqual([
						[0, 0, 0],
						[0, 0, 0],
						[0, 0, 0],
					])
				}
				const expectColumn = async (col: number) => {
					await expect(cursor).toHaveCount(1)
					await expect(tiles.nth(col)).toHaveAttribute('data-active-slot', 'true')
					await expect(cursor).toHaveText('')
					await expectGeometry()
				}
				await expectColumn(0)
				await expect(cursor).toHaveCSS('border-top-color', 'rgb(244, 180, 42)')
				await expect(cursor).toHaveCSS(
					'background-color',
					colorScheme === 'dark' ? 'rgba(244, 180, 42, 0.14)' : 'rgb(252, 240, 210)',
				)
				await expect(cursor).toHaveCSS('box-shadow', /inset/)
				if (width === 390) await board.getByRole('button', { name: '1', exact: true }).tap()
				else await page.keyboard.press('1')
				await expectColumn(1)
				await expect(tiles.first()).toHaveText('1')
				await page.screenshot({ path: testInfo.outputPath('arithmo-active-slot.png') })
				if (width === 390) await board.getByRole('button', { name: 'Delete', exact: true }).tap()
				else await page.keyboard.press('Backspace')
				await expectColumn(0)
				const equation = '12+34=46'
				for (const [col, char] of [...equation].entries()) {
					await page.keyboard.press(char)
					await expect(tiles.nth(col)).toHaveText(char)
					if (col < equation.length - 1) await expectColumn(col + 1)
				}
				await expect(cursor).toHaveCount(0)
				await expectGeometry()
			})

			for (const [slug, tableCount] of [
				['word-guess', 1],
				['quad-words', 4],
			] as const) {
				test(`${slug} amber cursor advances without shifting tiles`, async ({ page }, testInfo) => {
					await openBoard(page, slug)
					const board = page.locator(stage)
					const tiles = board.locator('td')
					const cursors = board.locator('td[data-active-slot="true"]')
					await expect(board.getByRole('table')).toHaveCount(tableCount)
					await expect(tiles).toHaveCount(tableCount * 30)
					await expect(
						page.locator(colorScheme === 'dark' ? 'html.dark' : 'html:not(.dark)'),
					).toHaveCount(1)
					await page.evaluate(() => document.fonts.ready)
					const bounds = () =>
						tiles.evaluateAll((cells) => cells.map((cell) => cell.getBoundingClientRect().toJSON()))
					const before = await bounds()
					const canvasBefore = await canvasGeometry(page)
					expect(canvasBefore.overflow).toEqual([
						[0, 0, 0],
						[0, 0, 0],
						[0, 0, 0],
					])
					const expectColumn = async (col: number) => {
						await expect(cursors).toHaveCount(tableCount)
						for (let i = 0; i < tableCount; i++) {
							await expect(tiles.nth(i * 30 + col)).toHaveAttribute('data-active-slot', 'true')
						}
						await expect(cursors).toHaveText(Array(tableCount).fill(''))
						expect(await bounds()).toEqual(before)
					}
					await expectColumn(0)
					await expect(cursors.first()).toHaveCSS('border-top-color', 'rgb(244, 180, 42)')
					const neutral = await tiles.nth(1).evaluate((el) => getComputedStyle(el).backgroundColor)
					await expect(cursors.first()).not.toHaveCSS('background-color', neutral)
					for (const [col, letter] of [...'CRANE'].entries()) {
						if (width === 390) await board.getByRole('button', { name: letter, exact: true }).tap()
						else await page.keyboard.press(letter)
						if (col < 4) await expectColumn(col + 1)
						else await expect(cursors).toHaveCount(0)
						for (let i = 0; i < tableCount; i++) {
							await expect(tiles.nth(i * 30 + col)).toHaveText(letter)
						}
					}
					expect(await bounds()).toEqual(before)
					if (width === 390) await board.getByRole('button', { name: 'Delete', exact: true }).tap()
					else await page.keyboard.press('Backspace')
					await expectColumn(4)
					expect(await canvasGeometry(page)).toEqual(canvasBefore)
					await page.screenshot({ path: testInfo.outputPath('active-slot.png') })
				})
			}
		})
	}
}

for (const [width, height] of layouts) {
	test.describe(width + '×' + height, () => {
		test.use({ viewport: { width, height }, hasTouch: width === 390, isMobile: width === 390 })
		for (const [locale, slugs] of [
			['en-US', [...wordGames, ...otherGames]],
			['zh-TW', ['nonogram', 'number-path', 'quad-words', 'block-slide', 'killer-sudoku']],
		] as const) {
			for (const slug of slugs) {
				test(slug + ' fits the frameless play canvas (' + locale + ')', async ({ page }) => {
					await openBoard(page, slug, locale)
					const dock = page.locator('[data-consent-banner]')
					await expect(dock.locator('[data-consent-choices]').getByRole('button')).toHaveText(
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
					const geometry = await canvasGeometry(page)
					expect(geometry).toEqual({
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
					if (slug === 'crossword' && width === 390) {
						const board = page.locator('[data-crossword-board]')
						const clues = board.locator('summary')
						const q = board.getByRole('button', { name: 'Q', exact: true })
						await expect(board.locator('.play-meta')).toBeHidden()
						await expect(clues.getByText('0 / 25', { exact: true })).toBeVisible()
						const before = [await q.boundingBox(), await clues.boundingBox()]
						await board.getByRole('button', { name: 'Check', exact: true }).tap()
						await expect(board.getByRole('alert')).toHaveText('Fill every square before checking.')
						expect([await q.boundingBox(), await clues.boundingBox()]).toEqual(before)
						expect(await canvasGeometry(page)).toEqual(geometry)
						await q.tap()
						await expect(clues.getByText('1 / 25', { exact: true })).toBeVisible()
					}
					if (slug === 'cryptogram') {
						const keyboard = page.locator('[data-cipher-keyboard]')
						await expect(keyboard).toHaveAttribute('dir', 'ltr')
						const geometry = await keyboard.evaluate((el) => {
							const rows = new Map<number, string[]>()
							const keys = Array.from(el.querySelectorAll('button'))
							for (const key of keys) {
								const top = key.getBoundingClientRect().top
								const row = rows.get(top) ?? []
								row.push(key.textContent?.trim() ?? '')
								rows.set(top, row)
							}
							return {
								rows: Array.from(rows.values(), (row) => row.join(' ')),
								minHeight: Math.min(...keys.map((key) => key.getBoundingClientRect().height)),
								overflow: el.scrollWidth - el.clientWidth,
							}
						})
						expect(geometry.rows).toEqual([
							'Q W E R T Y U I O P',
							'A S D F G H J K L',
							'Z X C V B N M Clear letter',
						])
						expect(geometry.minHeight).toBeGreaterThanOrEqual(44)
						expect(geometry.overflow).toBe(0)
					}
					if (slug === 'cryptogram' && width === 390) {
						const quote = page.locator('[data-cipher-quote]')
						const keyboard = page.locator('[data-cipher-keyboard]')
						const last = quote.locator('[data-cipher-letter]').last()
						await expect(quote.locator('[data-cipher-letter]').first()).toBeInViewport({ ratio: 1 })
						await expect(last).not.toBeInViewport()
						await expect(keyboard).toBeInViewport({ ratio: 1 })
						await last.focus()
						await expect(last).toBeInViewport({ ratio: 1 })
						await last.press('Enter')
						const key = keyboard.getByRole('button', { name: 'A', exact: true })
						await key.tap()
						await expect(last).toHaveAccessibleName(/: A$/)
						await expect(key).toHaveAttribute('data-used')
						await keyboard.getByRole('button', { name: 'Clear letter', exact: true }).tap()
						await expect(last).toHaveAccessibleName(/: blank$/)
						await expect(key).not.toHaveAttribute('data-used')

						const encrypted = await last.getAttribute('data-cipher-letter')
						await page.route('**/puzzled.v1.PuzzleService/CheckGuess', async (route) => {
							expect(JSON.parse(route.request().postDataJSON().guessJson)).toMatchObject({
								hint: true,
							})
							await route.fulfill({
								json: { resultJson: JSON.stringify({ encrypted, letter: 'A' }) },
							})
						})
						await page.getByRole('button', { name: /^Hint \(/ }).tap()
						await expect(last).toBeDisabled()
						await quote
							.locator(`[data-cipher-letter]:not([data-cipher-letter="${encrypted}"])`)
							.first()
							.tap()
						await expect(key).toHaveAttribute('data-used')
						await expect(key).toBeDisabled()
						await expect(keyboard).toBeInViewport({ ratio: 1 })
					}
					if (width >= 1024 && splitGames.includes(slug)) {
						const board = (await page.locator('.play-board').boundingBox())!
						const tools = (await page.locator('.play-tools').boundingBox())!
						expect(board.x + board.width).toBeLessThan(tools.x)
					}
					if (width >= 1024 && splitGames.includes(slug)) {
						const instruction = await page.locator(cue).evaluate((el) => {
							const range = document.createRange()
							const nodes = document.createTreeWalker(el, NodeFilter.SHOW_TEXT)
							const lines = new Set<number>()
							while (nodes.nextNode()) {
								range.selectNodeContents(nodes.currentNode)
								for (const rect of range.getClientRects()) {
									if (rect.width > 0) lines.add(rect.top)
								}
							}
							return { width: el.getBoundingClientRect().width, lines: lines.size }
						})
						expect(instruction.width).toBeGreaterThanOrEqual(220)
						expect(instruction.lines).toBeGreaterThan(0)
						expect(instruction.lines).toBeLessThanOrEqual(slug === 'killer-sudoku' ? 3 : 2)
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
						await dock.locator('[data-consent-choices]').getByRole('button').first().click()
						await expect(dock).toHaveCount(0)
						expect((await play.boundingBox())!.height).toBeGreaterThan(before)
					}
				})
			}
		}
	})
}

async function openCageCueFixture(page: Page, baseURL = 'http://localhost:3000') {
	if (!['localhost', '127.0.0.1'].includes(new URL(baseURL).hostname))
		throw new Error('Cage cue requires a local fixture')
	await page
		.context()
		.addCookies([
			{ name: 'puzzled_session', value: 'fixture-player', url: baseURL, httpOnly: true },
		])
	await openBoard(page, 'killer-sudoku')
}

for (const [width, height] of [
	[1440, 900],
	[390, 844],
]) {
	test.describe(`Cage Sudoku cue ${width}×${height}`, () => {
		test.use({ viewport: { width, height }, isMobile: width === 390, hasTouch: width === 390 })
		test('points to a cage without covering the board, and stays dismissed on reload', async ({
			page,
			baseURL,
		}, info) => {
			await openCageCueFixture(page, baseURL)
			const tip = page.locator('[data-cage-first-move]')
			const grid = page.locator('.play-board')
			const anchor = grid.locator('[data-cage-cue]').first()
			await expect(tip).toBeInViewport({ ratio: 1 })
			await expect(tip).toContainText('Tap a square, then tap a digit.')
			await expect(grid).toBeInViewport({ ratio: 1 })
			await expect(grid.locator('[data-cage-cue]')).toHaveCount(1)
			const total = anchor.locator('[data-cage-total]')
			await expect(total).toHaveText('6')
			await expect(total).toHaveCSS('font-size', '11px')
			expect((await canvasGeometry(page)).bad).toEqual([])
			await page.evaluate(() => document.fonts.ready)
			await info.attach(`cage-sudoku-${width}.png`, {
				body: await page.screenshot(),
				contentType: 'image/png',
			})
			const press = width === 390 ? 'tap' : 'click'
			await anchor[press]()
			await expect(anchor).toHaveAttribute('aria-pressed', 'true')
			await page.keyboard.press('n')
			await page.keyboard.press('1')
			const note = anchor.locator('[data-visible]')
			await expect(note).toBeVisible()
			expect((await total.boundingBox())!.y + 11).toBeLessThanOrEqual((await note.boundingBox())!.y)
			await expect(tip).toBeVisible()
			const beforeDismiss = await grid.boundingBox()
			await tip.getByRole('button', { name: 'Dismiss' })[press]()
			await expect(tip).toHaveCount(0)
			expect(await grid.boundingBox()).toEqual(beforeDismiss)
			if (width === 390) {
				await info.attach('cage-sudoku-390-dismissed.png', {
					body: await page.screenshot(),
					contentType: 'image/png',
				})
			}
			await page.reload()
			await expect(grid.locator('[aria-pressed="true"]')).toHaveCount(1)
			await expect(tip).toHaveCount(0)
		})
	})
}

test('Cage Sudoku cue retires on a conflict-free digit, not on a note or conflict', async ({
	page,
	baseURL,
}) => {
	await openCageCueFixture(page, baseURL)
	const tip = page.locator('[data-cage-first-move]')
	const cell = page.getByRole('button', { name: /^Row 1, Column 2,/ })
	await cell.click()
	for (const key of ['n', '5', 'n', '2']) await page.keyboard.press(key)
	await expect(cell).toHaveAttribute('aria-invalid', 'true')
	await expect(tip).toBeVisible()
	// 1 is not the solution here; it just has no conflict visible to the player.
	await page.keyboard.press('1')
	await expect(cell).not.toHaveAttribute('aria-invalid')
	await expect(tip).toBeHidden()
	await page.reload()
	await expect(cell).toHaveAccessibleName(/Column 2, 1,/)
	await expect(tip).toHaveCount(0)
})

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

const fiveNoticeCases = [
	['zh-HK', '英文單詞謎題', '拒絕分析及廣告'],
	['es', 'Juego de palabras en inglés', 'Rechazar'],
	['pt-BR', 'Jogo de palavras em inglês', 'Recusar'],
] as const

for (const [width, height] of [
	[390, 844],
	[1440, 900],
]) {
	test.describe(`Five direct landing ${width}×${height}`, () => {
		test.use({ viewport: { width, height }, isMobile: width === 390, hasTouch: width === 390 })
		for (const [locale, label, decline] of fiveNoticeCases) {
			test(`${locale}: one notice before Play even when the daily board resumes below`, async ({
				page,
			}) => {
				const path = `/${locale}/games/word-guess`
				await page.setExtraHTTPHeaders({ 'CF-IPCountry': 'DE' })
				await page.goto(path)
				// The enrolled craft server serves a playable frozen GetDaily snapshot.
				await expect(page.locator(stage)).toBeVisible()
				const hero = page.locator('.game-hero')
				const notice = hero.locator('[data-english-word-puzzle]')
				const play = hero.locator('a[data-start-intent="word-guess"]')
				const consent = page.locator('[data-consent-banner]')
				await expect(notice).toHaveText(label)
				await expect(page.locator('[data-english-word-puzzle]')).toHaveCount(1)
				await expect(play).toHaveCount(1)
				await expect(play).toHaveAttribute('href', `${path}?start=1#play`)
				await expect(consent).toBeVisible()
				for (const dismiss of [false, true]) {
					if (dismiss) {
						const button = consent.getByRole('button', { name: decline, exact: true })
						if (width === 390) await button.tap()
						else await button.click()
						await expect(consent).toHaveCount(0)
					}
					const bounds = (await notice.boundingBox())!
					const cta = (await play.boundingBox())!
					expect(bounds.y + bounds.height).toBeLessThanOrEqual(cta.y)
					await expect(notice).toBeInViewport({ ratio: 1 })
					await expect(play).toBeInViewport({ ratio: 1 })
					// Trial checks hit testing without starting a game or moving to the play route.
					if (width === 390) await play.tap({ trial: true })
					else await play.click({ trial: true })
					if (!dismiss)
						expect(cta.y + cta.height).toBeLessThanOrEqual((await consent.boundingBox())!.y)
				}
			})
		}
	})
}

test('direct landing has no language notice for English Five or localized Quad', async ({
	page,
}) => {
	for (const path of ['/games/word-guess', '/zh-HK/games/quad-words']) {
		await page.goto(path)
		await expect(page.locator('.game-hero [data-start-intent]')).toBeVisible()
		await expect(page.locator('.game-hero [data-english-word-puzzle]')).toHaveCount(0)
	}
	// The landing-only negative must not remove Quad's existing in-play notice.
	await openBoard(page, 'quad-words', 'zh-HK')
	await expect(page.locator('#play [data-english-word-puzzle]')).toHaveText('英文單詞謎題')
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
				await page.goto(`${gamePath(slug)}`, { waitUntil: 'commit' })
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

for (const recover of [true, false]) {
	test(
		recover
			? 'first Play recovers from a guest bootstrap network abort and starts once'
			: 'two guest bootstrap failures show Try again without starting the puzzle',
		async ({ page, context }) => {
			const slug = 'number-path'
			const daily = playable(slug)
			let bootstraps = 0
			const starts: unknown[] = []
			await page.route('**/v1/guest/session', (route) => {
				bootstraps++
				if (bootstraps === 1 || !recover) return route.abort('failed')
				return route.fulfill({
					json: { issued: true },
					headers: { 'Set-Cookie': '__Host-puzzled_guest=retry-fixture; HttpOnly; Secure; Path=/' },
				})
			})
			await page.route('**/puzzled.v1.PuzzleService/GetDaily', (route) =>
				route.fulfill({
					json: {
						gameSlug: slug,
						puzzleDate: daily.puzzleDate,
						canPlay: true,
						requiresStart: true,
					},
				}),
			)
			await page.route('**/puzzled.v1.PuzzleService/StartDaily', async (route) => {
				starts.push(route.request().postDataJSON())
				if (
					!(await route.request().headerValue('cookie'))?.includes(
						'__Host-puzzled_guest=retry-fixture',
					)
				) {
					return route.fulfill({
						status: 401,
						json: { code: 'unauthenticated', message: 'identity_required' },
					})
				}
				return route.fulfill({ json: { daily } })
			})
			await page.goto(`${gamePath(slug)}?start=1#play`)
			const play = page.locator('[data-game-stage="start"]').getByRole('button', { name: 'Play' })
			await expect(play).toBeEnabled()
			expect(await context.cookies()).toEqual([])
			expect(bootstraps).toBe(0)
			await play.click()
			const unavailable = page.getByRole('heading', { name: 'Puzzle not available' })
			const board = page.locator(`${stage} .play-board`)
			if (recover) {
				await expect(board).toBeVisible()
				await expect(unavailable).toHaveCount(0)
				expect(starts).toEqual([
					expect.objectContaining({ gameSlug: slug, puzzleDate: daily.puzzleDate }),
				])
			} else {
				await expect(unavailable).toBeVisible()
				await expect(board).toHaveCount(0)
				expect(starts).toEqual([])
				await page.getByRole('button', { name: 'Try again' }).click()
				await expect(play).toBeEnabled()
			}
			expect(bootstraps).toBe(2)
		},
	)
}

test.describe('Home Play at 390px', () => {
	test.use({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true })
	const assets = '**/_build/assets/*.js'
	const card = '[data-game-stage="start"] button'
	const cookie = '__Host-puzzled_guest=cold-home-fixture'
	const cookieHeader = `${cookie}; HttpOnly; Secure; Path=/`
	const intent = (page: Page) =>
		page.evaluate((key) => sessionStorage.getItem(key), START_INTENT_KEY)
	async function fixture(page: Page, resume = false) {
		const puzzleDate = productDayKey()
		const starts: unknown[] = []
		const guest = Promise.withResolvers<void>()
		const context = page.context()
		await context.route('**/v1/guest/session', async (route) => {
			await guest.promise
			await route.fulfill({ json: { issued: true }, headers: { 'Set-Cookie': cookieHeader } })
		})
		await context.route('**/puzzled.v1.PuzzleService/{GetDaily,StartDaily}', async (route) => {
			const input = route.request().postDataJSON()
			if (route.request().url().endsWith('/GetDaily')) {
				const startable = { ...input, puzzleDate, canPlay: true, requiresStart: true }
				return route.fulfill({
					json: resume ? playable(input.gameSlug, input.difficulty) : startable,
				})
			}
			starts.push(input)
			expect(await route.request().headerValue('cookie')).toContain(cookie)
			await route.fulfill({ json: { daily: playable(input.gameSlug, input.difficulty) } })
		})
		return { puzzleDate, starts, release: guest.resolve }
	}
	async function cold(page: Page, path = '/') {
		// Stop Home's external scripts while retaining the streamed SSR and its nonce script.
		await page.route(assets, (route) => route.abort())
		await page.goto(path)
		await page.unroute(assets)
		return page.locator('[data-home-featured]')
	}
	for (const path of ['/', '/zh-HK', '/ja']) {
		for (const hero of [true, false]) {
			test(`${path}: cold ${hero ? 'hero' : 'lineup'} starts exactly once after the cookie`, async ({
				page,
			}) => {
				const daily = await fixture(page)
				const featured = await cold(page, path)
				const featuredSlug = await featured.getAttribute('data-home-featured')
				const slug = hero ? featuredSlug : featuredSlug === 'sudoku' ? 'number-path' : 'sudoku'
				const play = hero ? featured : page.locator(`[data-home-game="${slug}"]`)
				const dest = new URL((await play.getAttribute('href'))!, page.url())
				const cookieRequest = page.waitForRequest('**/v1/guest/session')
				try {
					await play.tap()
					await expect(page).toHaveURL(dest.href)
					await expect(page.locator(card)).toBeDisabled()
					await cookieRequest
					expect(daily.starts).toEqual([])
				} finally {
					daily.release()
				}
				await expect(page.locator(stage)).toBeVisible()
				const difficulty = dest.searchParams.get('difficulty') ?? undefined
				expect(daily.starts).toEqual([{ gameSlug: slug, difficulty, puzzleDate: daily.puzzleDate }])
				await page.reload()
				await expect(page.locator(card)).toBeEnabled()
				expect(daily.starts).toHaveLength(1)
			})
		}
	}
	for (const mode of ['Ctrl', 'middle', '_blank'] as const) {
		test(`${mode} carries no Play intent`, async ({ page, context }) => {
			const { starts, release } = await fixture(page)
			release()
			const play = await cold(page)
			const from = page.url()
			const href = new URL((await play.getAttribute('href'))!, from).href
			expect(href).toMatch(/[?&]start=1#play$/)
			if (mode === '_blank') await play.evaluate((a) => a.setAttribute('target', '_blank'))
			const tabs: string[] = []
			context.on('page', (tab) => tabs.push(tab.url()))
			// The capture listens on document, so window hears the same press after it. Cancel
			// the new tab there: creating and loading it is the browser's job, not the app's.
			const seen = await page.evaluateHandle(() => {
				const events: unknown[] = []
				for (const type of ['click', 'auxclick']) {
					addEventListener(type, (e) => {
						const { isTrusted, defaultPrevented, button, ctrlKey } = e as MouseEvent
						const target = (e.target as Element).closest('a')?.target
						events.push({ type, isTrusted, defaultPrevented, button, ctrlKey, target })
						e.preventDefault()
					})
				}
				return events
			})
			await play.click({
				button: mode === 'middle' ? 'middle' : 'left',
				modifiers: mode === 'Ctrl' ? ['Control'] : [],
			})
			// One trusted, uncancelled press reached the capture; only its button, key or target differ.
			expect(await seen.jsonValue()).toEqual([
				{
					type: mode === 'middle' ? 'auxclick' : 'click',
					isTrusted: true,
					defaultPrevented: false,
					button: mode === 'middle' ? 1 : 0,
					ctrlKey: mode === 'Ctrl',
					target: mode === '_blank' ? '_blank' : '',
				},
			])
			expect(page.url()).toBe(from)
			expect(await intent(page)).toBeNull()
			// The destination as the new tab would load it: referred by Home, with no recorded press.
			await page.goto(href, { referer: from })
			await expect(page.locator(card)).toBeEnabled()
			expect(starts).toEqual([])
			expect(tabs).toEqual([])
		})
	}
	for (const mode of ['expired', 'storage blocked', 'reload/paste/share', 'resume']) {
		test(`cold Home: ${mode} never claims a pick`, async ({ page, context }) => {
			const { starts, release } = await fixture(page, mode === 'resume')
			release()
			if (mode === 'storage blocked') {
				await page.addInitScript(() => {
					const blocked = () => {
						throw new DOMException('Blocked', 'SecurityError')
					}
					Object.defineProperty(window, 'sessionStorage', { get: blocked })
				})
			}
			await cold(page)
			const sudoku = page.locator('[data-home-game="sudoku"], [data-home-featured="sudoku"]')
			const href = new URL((await sudoku.getAttribute('href'))!, page.url()).href
			if (mode === 'expired') {
				const at = Date.now() - START_INTENT_TTL_MS - 1
				const record = { slug: 'sudoku', href, from: page.url(), at }
				await page.evaluate(
					({ key, record }) => sessionStorage.setItem(key, JSON.stringify(record)),
					{ key: START_INTENT_KEY, record },
				)
				await page.goto(href, { referer: record.from })
			} else if (mode === 'reload/paste/share') {
				await page.route(assets, (route) => route.abort())
				await sudoku.tap()
				await expect(page).toHaveURL(href)
				const raw = await intent(page)
				expect(raw).not.toBeNull()
				await page.unroute(assets)
				await page.reload()
				await expect(page.locator(card)).toBeEnabled()
				await page.goto('/games')
				const setIntent = ({ key, value }: { key: string; value: string }) =>
					sessionStorage.setItem(key, value)
				await page.evaluate(setIntent, { key: START_INTENT_KEY, value: raw! })
				await page.goto(href)
				const shared = await context.newPage()
				await shared.goto(href.replace('#', '&utm_source=share#'))
				await expect(shared.locator(card)).toBeEnabled()
			} else await sudoku.tap()
			await expect(page).toHaveURL(/\/games\/sudoku\?difficulty=medium&start=1#play$/)
			if (mode === 'resume') await expect(page.locator(stage)).toBeVisible()
			else await expect(page.locator(card)).toBeEnabled()
			if (mode !== 'storage blocked') expect(await intent(page)).toBeNull()
			expect(starts).toEqual([])
		})
	}
})
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
				await page.goto(`${gamePath(slug)}?start=1${fresh ? '' : '&difficulty=medium'}#play`)
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
		googleRequests: google,
	}) => {
		await page.setViewportSize({ width, height })
		await page.setExtraHTTPHeaders({ 'CF-IPCountry': 'DE' })
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
		await page.route('**/v1/guest/session', (route) =>
			route.fulfill({
				json: { issued: true },
				headers: { 'Set-Cookie': '__Host-puzzled_guest=reload-fixture; HttpOnly; Secure; Path=/' },
			}),
		)
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
					Object.keys(sessionStorage).some((key) => key.startsWith('puzzled:play-draft:v2:')),
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
		expect((await context.cookies()).map(({ name, httpOnly }) => ({ name, httpOnly }))).toEqual([
			{ name: '__Host-puzzled_guest', httpOnly: true },
		])
		const storage = await page.evaluate(async () => ({
			local: Object.keys(localStorage).sort(),
			session: Object.keys(sessionStorage).sort(),
			idb: (await indexedDB.databases()).map(({ name }) => name),
		}))
		expect(storage).toEqual({
			local: ['puzzled:pwa:first-finish-day'],
			session: ['puzzled:daily-level:sudoku', 'puzzled:play-draft-tab'],
			idb: [],
		})
	})
}

test('Path restores only the same viewer and served puzzle', async ({ page, context, baseURL }) => {
	if (!baseURL) throw new Error('Path requires the fixture server URL')
	const account = (value: string) => ({
		name: 'puzzled_session',
		value,
		url: baseURL,
		httpOnly: true,
	})
	await context.addCookies([account('path-fixture-a')])
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
	await context.addCookies([account('path-fixture-b')])
	await page.reload()
	await expect(clue).toHaveAttribute('aria-pressed', 'false')
	await context.addCookies([account('path-fixture-a')])
	await page.reload()
	await expect(clue).toHaveAttribute('aria-pressed', 'true')
	daily.puzzleId = 'f5477d51-a783-48bc-98e0-c37620319042'
	await page.reload()
	await expect(clue).toHaveAttribute('aria-pressed', 'false')
})

for (const { width, height, difficulty } of [
	{ width: 390, height: 844, difficulty: 'hard' },
	{ width: 1440, height: 900, difficulty: 'hard' },
]) {
	test.describe(`Sudoku daily choice on ${width}×${height}`, () => {
		const touch = width === 390
		test.use({ viewport: { width, height }, isMobile: touch, hasTouch: touch })

		test(`shows one picker; choosing claims nothing and Play opens Hard`, async ({ page }) => {
			// The browser wiring is real; the Rust pick cap and replay are covered by DB tests.
			const slug = 'sudoku'
			const puzzleDate = productDayKey()
			const starts: unknown[] = []
			await page.route('**/v1/guest/session', (route) => route.fulfill({ json: { issued: true } }))
			await page.route('**/puzzled.v1.PuzzleService/GetDaily', (route) =>
				route.fulfill({
					json: { gameSlug: slug, puzzleDate, canPlay: true, requiresStart: true },
				}),
			)
			await page.route('**/puzzled.v1.PuzzleService/StartDaily', (route) => {
				starts.push(route.request().postDataJSON())
				return route.fulfill({ json: { daily: playable(slug, difficulty) } })
			})
			await page.goto(touch ? '/games/sudoku' : '/games/sudoku?start=1#play')
			const choices = page.getByRole('group', { name: 'Select Difficulty', exact: true })
			const medium = choices.getByRole('radio', { name: 'Medium', exact: true })
			const hard = choices.getByRole('radio', { name: 'Hard', exact: true })
			const play = choices.getByRole('link', { name: "Play today's puzzle", exact: true })
			await expect(choices).toHaveCount(1)
			await expect(choices.getByRole('radio')).toHaveCount(3)
			await expect(medium).toBeChecked()
			await expect(play).toHaveAttribute('href', '/games/sudoku?difficulty=medium&start=1#play')
			for (const link of await choices.locator('label').all()) {
				await expect(link).toBeInViewport({ ratio: 1 })
				expect(
					await link.evaluate((element) => {
						const { x, y, width, height } = element.getBoundingClientRect()
						return (
							width >= 48 &&
							height >= 48 &&
							element.contains(document.elementFromPoint(x + width / 2, y + height / 2))
						)
					}),
				).toBe(true)
			}
			if (touch) await choices.getByText('Hard', { exact: true }).tap()
			else {
				await medium.focus()
				await page.keyboard.press('ArrowRight')
			}
			await expect(hard).toBeChecked()
			await expect(play).toHaveAttribute('href', '/games/sudoku?difficulty=hard&start=1#play')
			await expect(play).toBeInViewport({ ratio: 1 })
			expect(starts).toEqual([])
			if (touch) {
				await play.tap()
			} else {
				await page.keyboard.press('Tab')
				await expect(play).toBeFocused()
				await expect(play).toHaveCSS('outline-width', '2px')
				await page.keyboard.press('Enter')
			}
			await expect(
				page.locator(stage).getByRole('group', { name: 'Sudoku', exact: true }),
			).toBeVisible()
			await expect(page.locator('[data-game-stage="start"] button')).toHaveCount(0)
			await expect(choices).toHaveCount(0)
			expect(starts).toEqual([{ gameSlug: slug, difficulty, puzzleDate }])
		})
	})
}
