import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { expect, type Page, test } from '@playwright/test'
import { productDayKey } from '../src/lib/product-day'

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
	[1920, 1080],
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
			return JSON.stringify([el.className, width, height])
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
