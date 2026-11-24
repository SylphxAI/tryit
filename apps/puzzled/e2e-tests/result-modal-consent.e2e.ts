import { expect, type Locator, type Page, test } from '@playwright/test'
import crosswordGoldens from '../../../crates/puzzled-core/tests/fixtures/generate/crossword.json'
import { fixtureShareId } from '../scripts/share-fixture-facts'
import { productDayKey } from '../src/lib/product-day'

/**
 * A first-visit guest finishes today's game without answering the cookie
 * banner. The banner must not sit on the result modal's actions (WCAG 2.2
 * SC 2.4.11), and its own buttons must still respond.
 */
test.use({
	viewport: { width: 390, height: 844 },
	hasTouch: true,
	isMobile: true,
	bypassCSP: process.env.PUZZLED_TEST_DEV_CSP === '1',
})

const solution = Array.from({ length: 9 }, (_, r) =>
	Array.from({ length: 9 }, (_, c) => ((r * 3 + Math.floor(r / 3) + c) % 9) + 1),
)

// Unlike locator.tap(), a hit test must not scroll an obscured action into view.
async function expectDirectHit(target: Locator, upperEdge?: number) {
	await expect(target).toBeVisible()
	const hit = await target.evaluate((el, edge) => {
		const r = el.getBoundingClientRect()
		return {
			clear: edge == null || r.bottom <= edge,
			direct: el.contains(document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2)),
		}
	}, upperEdge)
	expect(hit).toEqual({ clear: true, direct: true })
}

async function showPhoneDock(page: Page) {
	await page.setExtraHTTPHeaders({ 'CF-IPCountry': 'DE' })
	const cdp = await page.context().newCDPSession(page)
	await cdp.send('Emulation.setSafeAreaInsetsOverride', { insets: { bottom: 34 } })
	await page.route('**/v1/guest/session', (route) => route.fulfill({ json: { issued: true } }))
	return page.locator('[data-consent-banner]')
}

test('winning Sudoku reveals Share and See your result above the phone dock before any scroll or tap', async ({
	page,
}) => {
	const banner = await showPhoneDock(page)
	const today = productDayKey()
	await page.route('**/puzzled.v1.PuzzleService/ShareResult', (route) =>
		route.fulfill({ json: { shareId: fixtureShareId } }),
	)
	await page.route('**/puzzled.v1.PuzzleService/GetDaily', (route) =>
		route.fulfill({
			json: {
				gameSlug: 'sudoku',
				difficulty: 'easy',
				canPlay: true,
				puzzleDate: today,
				puzzleDataJson: JSON.stringify({
					grid: solution.map((row, r) => row.map((v, c) => (r === 8 && c === 8 ? null : v))),
					difficulty: 'easy',
				}),
			},
		}),
	)
	await page.route('**/puzzled.v1.PuzzleService/SubmitGuess', (route) =>
		route.fulfill({ json: { valid: true, status: 'won', score: 900, gameSlug: 'sudoku' } }),
	)
	await page.goto('/games/sudoku?difficulty=easy&start=1#play')
	await expect(banner).toBeVisible()
	const nav = page.locator('nav.fixed[aria-label="Main navigation"]')
	await expect(nav.getByRole('link')).toHaveCount(5)
	const navBox = (await nav.boundingBox())!
	expect(navBox.y + navBox.height).toBe(844)
	expect(await nav.evaluate((el) => getComputedStyle(el).paddingBottom)).toBe('34px')
	const board = page.getByRole('group', { name: 'Sudoku', exact: true })
	await board.getByRole('button', { name: 'Row 9, Column 9', exact: true }).tap()
	await page.getByRole('button', { name: String(solution[8][8]), exact: true }).tap()
	const share = page.getByRole('button', { name: 'Share', exact: true })
	const details = page.getByRole('button', { name: 'See your result', exact: true })
	const bannerBox = (await banner.boundingBox())!
	expect(bannerBox.height).toBeLessThan(84)
	await expect(banner.getByRole('link', { name: 'Privacy policy' })).toHaveAttribute(
		'href',
		'/privacy',
	)
	await expect(banner.locator('a svg')).toHaveCount(0)
	const choices = await banner.getByRole('button').all()
	expect(await banner.getByRole('button').allTextContents()).toEqual([
		'Decline',
		'Accept',
		'Analytics only',
	])
	for (const choice of choices) {
		const { width, height } = (await choice.boundingBox())!
		expect(Math.min(width, height)).toBeGreaterThanOrEqual(44)
		await expectDirectHit(choice)
	}
	expect(bannerBox.y + bannerBox.height).toBeCloseTo(navBox.y, 0)
	for (const action of [share, details]) {
		await expectDirectHit(action, bannerBox.y)
		const box = (await action.boundingBox())!
		expect(Math.min(box.width, box.height)).toBeGreaterThanOrEqual(44)
	}
	const shareTap = page.waitForRequest(
		(request) =>
			request.url().endsWith('/puzzled.v1.PuzzleService/ShareResult') &&
			request.postDataJSON()?.tap === true,
	)
	await share.tap()
	expect((await shareTap).postDataJSON()).toMatchObject({ gameSlug: 'sudoku', puzzleDate: today })
	await expect(share).toBeEnabled()
	await details.tap()
	const dialog = page.getByRole('dialog', { name: 'Sudoku Complete' })
	await expect(dialog).toBeVisible()
	await expect(dialog.getByText('900', { exact: true })).toBeVisible()

	// Every action in the modal must be the element under its own centre.
	const targets = dialog.locator('a, button').filter({ visible: true })
	const count = await targets.count()
	expect(count).toBeGreaterThan(0)
	for (let i = 0; i < count; i++) {
		const target = targets.nth(i)
		await target.scrollIntoViewIfNeeded()
		await expectDirectHit(target)
	}

	await dialog.getByRole('button', { name: 'Dismiss', exact: true }).tap()
	await expect(dialog).toBeHidden()
	await expect(details).toBeFocused()
	await banner.getByRole('button', { name: 'Decline', exact: true }).tap()
	await expect(banner).toBeHidden()
})

test('Mini Grid bottom-row keys enter letters without scrolling behind the phone dock', async ({
	page,
}) => {
	const banner = await showPhoneDock(page)
	const { puzzleData } = crosswordGoldens[0]
	await page.route('**/puzzled.v1.PuzzleService/GetDaily', (route) =>
		route.fulfill({
			json: {
				gameSlug: 'crossword',
				puzzleDate: productDayKey(),
				canPlay: true,
				puzzleDataJson: JSON.stringify(puzzleData),
			},
		}),
	)
	await page.goto('/games/crossword?start=1#play')
	const board = page.locator('[data-crossword-board]')
	await expect(banner).toBeVisible()
	const edge = (await banner.boundingBox())!.y
	for (const [col, letter] of [...'ZXCV'].entries()) {
		const key = board.getByRole('button', { name: letter, exact: true })
		await expectDirectHit(key, edge)
		const box = (await key.boundingBox())!
		await page.touchscreen.tap(box.x + box.width / 2, box.y + box.height / 2)
		await expect(
			board.getByRole('button', {
				name: `Row 1, Column ${col + 1}, ${letter}`,
				exact: true,
			}),
		).toBeVisible()
	}
	await expect(banner).toBeVisible()
	await expect(page).toHaveURL(/games\/crossword\?start=1#play$/)
})
