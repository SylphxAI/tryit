import { expect, type Locator, type Page, test } from '@playwright/test'
import { productDayKey } from '../src/lib/product-day'

const board = (page: Page) => page.locator('[data-nonogram-board] .play-board')
const clue = (page: Page, row: number) => board(page).locator(`#paint-row-${row}`)
const cell = (page: Page, row: number, col: number) =>
	board(page).locator(`[data-paint-row="${row}"][data-paint-col="${col}"]`)
const consent = (page: Page) => page.locator('[data-consent-banner]')
const path = (locale: string) => `/${locale}/games/nonogram?difficulty=medium&start=1#play`

async function fixture(page: Page, baseURL: string | undefined, long: boolean) {
	const base = new URL(baseURL ?? 'http://localhost:3000')
	if (!['127.0.0.1', 'localhost'].includes(base.hostname)) {
		throw new Error('Paint clue tests require a loopback fixture')
	}
	// Short clues reproduce the narrow track. Alternating squares exercise the
	// longest legal run list on a 10-column board; the last row has a two-digit run.
	const picture = [
		'0111100000',
		'0011110000',
		'0001111000',
		'0000111100',
		'0000011110',
		'0000001111',
		'0000011110',
		'0000111100',
		'0001111000',
		'0011110000',
	]
	if (long) {
		picture[1] = '1010101010'
		picture[9] = '1111111111'
	}
	const runs = (line: string) => (line.match(/1+/g) ?? ['']).map((run) => run.length)
	const data = {
		width: 10,
		height: 10,
		rowClues: picture.map(runs),
		colClues: Array.from({ length: 10 }, (_, col) =>
			runs(picture.map((line) => line[col]).join('')),
		),
	}
	const daily = {
		gameSlug: 'nonogram',
		puzzleId: '01ab5877-634a-419f-8a51-004218dacb21',
		puzzleDate: productDayKey(),
		canPlay: true,
		puzzleDataJson: JSON.stringify(data),
	}
	const calls = { starts: 0, submits: 0 }
	await page.route('**/*', async (route) => {
		const url = new URL(route.request().url())
		if (url.origin !== base.origin) return route.abort()
		if (url.pathname === '/v1/guest/session') {
			return route.fulfill({
				json: { issued: true },
				headers: {
					'Set-Cookie': '__Host-puzzled_guest=clue-fixture; Path=/; Secure; HttpOnly',
				},
			})
		}
		if (!url.pathname.startsWith('/puzzled.v1.')) return route.continue()
		switch (url.pathname.split('/').pop()) {
			case 'GetDaily':
				return route.fulfill({ json: { ...daily, requiresStart: calls.starts === 0 } })
			case 'StartDaily':
				calls.starts++
				return route.fulfill({ json: { daily } })
			case 'SubmitGuess':
				calls.submits++
				return route.abort()
			default:
				return route.fulfill({ json: {} })
		}
	})
	await page.setExtraHTTPHeaders({ 'CF-IPCountry': 'DE' })
	return calls
}

async function open(page: Page, locale: string, touch: boolean) {
	await page.goto(path(locale))
	await expect(consent(page)).toBeVisible()
	await expect(board(page)).toHaveCount(0)
	const start = page.locator('[data-game-stage="start"] button')
	if (touch) await start.tap()
	else await start.click()
	await expect(board(page)).toBeVisible()
	await page.evaluate(() => document.fonts.ready)
}

async function bounds(target: Locator) {
	const box = await target.boundingBox()
	if (!box) throw new Error(`No box for ${target}`)
	return box
}

async function geometry(page: Page) {
	await expect(board(page).locator('[data-paint-row][data-paint-col]')).toHaveCount(100)
	await expect(board(page).locator('[id^="paint-col-"]')).toHaveCount(10)
	await expect(board(page).locator('[id^="paint-row-"]')).toHaveCount(10)
	await expect(board(page)).toBeInViewport({ ratio: 1 })
	const [frame, dock] = await Promise.all([bounds(board(page)), bounds(consent(page))])
	expect(frame.y + frame.height).toBeLessThanOrEqual(dock.y)
	expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(
		page.viewportSize()?.width,
	)
	return board(page).evaluate((node) => {
		const rect = (el: Element) => el.getBoundingClientRect().toJSON() as DOMRect
		const hit = (el: Element, x: number, y: number) => el.contains(document.elementFromPoint(x, y))
		return Array.from({ length: 10 }, (_, row) => {
			const label = node.querySelector(`#paint-row-${row}`)!
			const first = node.querySelector(`[data-paint-row="${row}"][data-paint-col="0"]`)!
			const last = node.querySelector(`[data-paint-row="${row}"][data-paint-col="9"]`)!
			const clueBox = rect(label)
			const firstBox = rect(first)
			const lastBox = rect(last)
			const y = clueBox.y + clueBox.height / 2
			const digits = Array.from(label.querySelectorAll('span:not([aria-hidden])'), (digit) => {
				const range = document.createRange()
				range.selectNodeContents(digit)
				const glyphs = Array.from(range.getClientRects())
				return {
					text: digit.textContent,
					right: glyphs[0]?.right ?? Infinity,
					inside:
						glyphs.length === 1 &&
						glyphs.every(
							(glyph) =>
								glyph.left >= clueBox.left &&
								glyph.right <= clueBox.right &&
								glyph.top >= clueBox.top &&
								glyph.bottom <= clueBox.bottom,
						),
				}
			})
			return {
				clueBox,
				firstBox,
				lastBox,
				digits,
				clueHit: hit(label, clueBox.x + clueBox.width / 2, y),
				nearHit: hit(label, clueBox.x + clueBox.width / 2 + 12, y),
				gutterHit: hit(label, firstBox.x - 3, y) && digits.at(-1)!.right <= firstBox.x - 12,
				firstEdgeHit: hit(first, firstBox.x + 2, y),
				lastEdgeHit: hit(last, lastBox.right - 2, y),
			}
		})
	})
}

async function touchLine(
	page: Page,
	start: { x: number; y: number },
	end: { x: number; y: number },
) {
	const cdp = await page.context().newCDPSession(page)
	try {
		await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [start] })
		for (let step = 1; step <= 6; step++) {
			const x = start.x + ((end.x - start.x) * step) / 6
			const y = start.y + ((end.y - start.y) * step) / 6
			await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x, y }] })
		}
		await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] })
	} finally {
		await cdp.detach()
	}
}

for (const [locale, long, touch] of [
	['en-US', false, true],
	['pt-BR', false, true],
	['pt-BR', true, true],
	['en-US', false, false],
	['pt-BR', true, false],
] as const) {
	test.describe(`${locale} ${long ? 'long' : 'short'} clues, ${touch ? 'phone' : 'desktop'}`, () => {
		test.use({
			locale,
			hasTouch: touch,
			isMobile: touch,
			serviceWorkers: 'block',
			viewport: touch ? { width: 390, height: 844 } : { width: 1440, height: 900 },
		})
		test('Paint separates row clues from real cell input with consent open', async ({
			page,
			baseURL,
		}, info) => {
			const calls = await fixture(page, baseURL, long)
			await open(page, locale, touch)
			const rows = await geometry(page)
			await info.attach('row and cell geometry', {
				body: JSON.stringify(rows),
				contentType: 'application/json',
			})
			await info.attach('open-consent board', {
				body: await page.screenshot(),
				contentType: 'image/png',
			})
			for (const row of rows) {
				expect(row.digits.length).toBeGreaterThan(0)
				expect(row.digits.every((digit) => digit.inside)).toBe(true)
				expect(row.clueHit && row.firstEdgeHit && row.lastEdgeHit).toBe(true)
				if (touch) {
					expect.soft(row.clueBox.width).toBeGreaterThanOrEqual(40)
					expect.soft(row.clueBox.right).toBeLessThanOrEqual(row.firstBox.x)
					expect.soft(row.nearHit).toBe(true)
					expect.soft(row.gutterHit).toBe(true)
					expect(row.firstBox.width).toBeGreaterThanOrEqual(26)
				}
			}
			expect(rows[0].digits.map((digit) => digit.text)).toEqual(['4'])
			if (long) {
				expect(rows[1].digits.map((digit) => digit.text)).toEqual(['1', '1', '1', '1', '1'])
				expect(rows[9].digits.map((digit) => digit.text)).toEqual(['10'])
			}
			const label = clue(page, 0)
			const first = cell(page, 0, 0)
			await expect(label).toHaveAccessibleName(locale === 'pt-BR' ? 'Linha 1: 4' : 'Row 1: 4')
			const { clueBox, firstBox } = rows[0]
			const x = clueBox.x + clueBox.width / 2
			const y = clueBox.y + clueBox.height / 2
			if (touch) {
				const mark = locale === 'pt-BR'
				if (mark) await page.getByRole('button', { name: 'Marcar', exact: true }).tap()
				await page.touchscreen.tap(x, y)
				await expect(label).toHaveAttribute('aria-pressed', 'true')
				await expect(first).toHaveAttribute('aria-pressed', 'false')
				await page.touchscreen.tap(x + 12, y)
				await expect.soft(label).toHaveAttribute('aria-pressed', 'false', { timeout: 800 })
				await expect.soft(first).toHaveAttribute('aria-pressed', 'false', { timeout: 800 })
				// The padding on the clue side of the seam is a real hit target.
				await page.touchscreen.tap(firstBox.x - 3, y)
				await expect.soft(label).toHaveAttribute('aria-pressed', 'true', { timeout: 800 })
				await expect.soft(first).toHaveAttribute('aria-pressed', 'false', { timeout: 800 })
				await page.touchscreen.tap(firstBox.x + 2, y)
				await expect(first).toHaveAttribute('aria-pressed', mark ? 'mixed' : 'true')
				await expect(label).toHaveAttribute('aria-pressed', 'true')
				await expect(board(page).locator('[data-filled], [data-marked]')).toHaveCount(1)
			} else {
				await board(page).locator('#paint-col-9').focus()
				await page.keyboard.press('Tab')
				await expect(label).toBeFocused()
				await page.keyboard.press('Enter')
				await expect(label).toHaveAttribute('aria-pressed', 'true')
				await page.keyboard.press('Space')
				await expect(label).toHaveAttribute('aria-pressed', 'false')
				await expect(first).toHaveAttribute('aria-pressed', 'false')
				await page.keyboard.press('Tab')
				await expect(first).toBeFocused()
				await page.keyboard.press('ArrowRight')
				await expect(cell(page, 0, 1)).toBeFocused()
				await page.keyboard.press('ArrowLeft')
				await expect(first).toBeFocused()
				await page.keyboard.press('Space')
				await expect(first).toHaveAttribute('aria-pressed', 'true')
			}
			await expect(consent(page)).toBeVisible()
			expect(calls).toEqual({ starts: 1, submits: 0 })
		})
	})
}

test.describe('touch stroke at the clue boundary', () => {
	test.use({
		viewport: { width: 390, height: 844 },
		hasTouch: true,
		isMobile: true,
		serviceWorkers: 'block',
	})
	test('a stroke can start at the first cell edge and resume as one undoable edit', async ({
		page,
		baseURL,
	}) => {
		const calls = await fixture(page, baseURL, false)
		await open(page, 'en-US', true)
		const first = await bounds(cell(page, 2, 0))
		const last = await bounds(cell(page, 2, 2))
		const y = first.y + first.height / 2
		await touchLine(page, { x: first.x + 2, y }, { x: last.x + last.width / 2, y })
		for (const col of [0, 1, 2])
			await expect(cell(page, 2, col)).toHaveAttribute('aria-pressed', 'true')
		await expect(board(page).locator('[data-filled]')).toHaveCount(3)
		await page.reload()
		await expect(clue(page, 3)).toHaveAttribute('aria-pressed', 'false')
		await expect(board(page).locator('[data-filled]')).toHaveCount(3)
		await page.getByRole('button', { name: 'Undo', exact: true }).tap()
		await expect(board(page).locator('[data-filled]')).toHaveCount(0)
		await expect(clue(page, 3)).toHaveAttribute('aria-pressed', 'false')
		await expect(consent(page)).toBeVisible()
		expect(calls).toEqual({ starts: 1, submits: 0 })
	})
})
