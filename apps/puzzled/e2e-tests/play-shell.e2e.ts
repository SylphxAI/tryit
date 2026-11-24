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

const layouts = [
	[1280, 800],
	[1280, 803],
	[1440, 900],
	[390, 844],
]
for (const [width, height] of layouts) {
	test.describe(`${width}×${height}`, () => {
		test.use({ viewport: { width, height }, hasTouch: width === 390, isMobile: width === 390 })
		for (const slug of [...otherGames.slice(0, 4), 'quad-words', 'crossword']) {
			test(`${slug} entry keeps the cue and game controls clear of consent`, async ({ page }) => {
				await openBoard(page, slug)
				const banner = page.locator('[data-consent-banner]')
				await expect(banner.getByRole('button')).toHaveText(['Decline', 'Accept', 'Analytics only'])
				await expect(page.locator(cue)).toBeInViewport({ ratio: 1 })
				expect(
					await page.locator(cue).evaluate((el) => {
						const range = document.createRange()
						range.selectNodeContents(el)
						return range.getClientRects().length
					}),
				).toBe(1)
				const geometry = await page.evaluate((stageSelector) => {
					const dock = document.querySelector('[data-consent-banner]')!.getBoundingClientRect()
					const stage = document.querySelector(stageSelector)!
					const controls = [...stage.querySelectorAll('button, a, input, [role="button"]')]
					const overlaps = controls
						.filter((el) => {
							const r = el.getBoundingClientRect()
							return (
								r.width > 0 &&
								r.bottom > dock.top &&
								r.top < dock.bottom &&
								r.left < dock.right &&
								r.right > dock.left &&
								document
									.elementsFromPoint(
										(r.left + r.right) / 2,
										(Math.max(r.top, dock.top) + Math.min(r.bottom, dock.bottom)) / 2,
									)
									.some((hit) => el.contains(hit))
							)
						})
						.map((el) => el.getAttribute('aria-label') || el.textContent)
					const choices = [...document.querySelectorAll('[data-consent-banner] button')].map(
						(el) => [
							el.className,
							el.getBoundingClientRect().width,
							el.getBoundingClientRect().height,
						],
					)
					return {
						overlaps,
						equalChoices: new Set(choices.map((item) => JSON.stringify(item))).size === 1,
					}
				}, stage)
				expect(geometry).toEqual({ overlaps: [], equalChoices: true })
				await checkHelp(page, 'How to play')
				// Scroll to a real board control if the puzzle is taller than the scrollport.
				// Hit-test the unassisted pointer position (no retry/auto-scroll click).
				const key = page.locator(stage).getByRole('button').and(page.locator(':enabled')).last()
				await key.evaluate((el) => el.scrollIntoView({ block: 'end' }))
				expect(
					await key.evaluate((el) => {
						const r = el.getBoundingClientRect()
						return el.contains(
							document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2),
						)
					}),
				).toBe(true)
			})
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
