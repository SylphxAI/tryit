import { expect, type Locator, type Page, test } from '@playwright/test'
import { productDayKey } from '../src/lib/product-day'
import { PAINT_MODE_CUE_SEEN_DAY_KEY } from '../src/lib/storage-keys'

const copy = {
	'en-US': [
		'Fill',
		'Mark',
		'Squares in the picture',
		'Squares to leave empty',
		'Undo',
		'Start over',
	],
	'en-GB': [
		'Fill',
		'Mark',
		'Squares in the picture',
		'Squares to leave empty',
		'Undo',
		'Start over',
	],
	'zh-HK': ['填色', '標記', '圖案入面嘅格', '要留空嘅格', '復原', '重新開始'],
	'zh-TW': ['填色', '標記', '構成圖案的格子', '要留空的格子'],
	'zh-CN': ['填色', '标记', '组成图案的格子', '要留空的格子'],
	ja: ['塗る', '印', '絵になるマス', '空けておくマス'],
	es: ['Rellenar', 'Marcar', 'Casillas de la imagen', 'Casillas que quedan vacías'],
	'pt-BR': ['Preencher', 'Marcar', 'Casas da imagem', 'Casas que ficam vazias'],
} as const
const puzzleDate = productDayKey()
const puzzleId = '11a198bc-8079-4830-8c07-0d397aaabc73'
const gameSlug = 'nonogram'
const cell = (page: Page, row: number, col: number) =>
	page.locator(`button[data-paint-row="${row}"][data-paint-col="${col}"]`)
const board = (page: Page) => page.locator('[data-nonogram-board] .play-board')
const buttons = (page: Page) => page.locator('[data-nonogram-board] .play-tools')
const banner = (page: Page) => page.locator('[data-consent-banner]')

async function fixture(
	page: Page,
	baseURL: string | undefined,
	scenario: 'play' | 'finish' | 'locked',
) {
	const base = new URL(baseURL ?? 'http://localhost:3000')
	if (!['localhost', '127.0.0.1'].includes(base.hostname))
		throw new Error('Paint fixture requires loopback')
	const calls = { starts: 0, submits: 0 }
	// A synthetic 10×10 diagonal; the finish case uses a smaller synthetic board.
	const data =
		scenario === 'finish'
			? { width: 2, height: 2, rowClues: [[1], [0]], colClues: [[1], [0]] }
			: {
					width: 10,
					height: 10,
					rowClues: Array.from({ length: 10 }, () => [1]),
					colClues: Array.from({ length: 10 }, () => [1]),
				}
	const daily = {
		gameSlug,
		puzzleId,
		puzzleDate,
		canPlay: true,
		puzzleDataJson: JSON.stringify(data),
	}
	const completed = {
		hasCompleted: true,
		canPlay: false,
		completedSession: { status: 'won', attempts: 1, score: 5, difficulty: 'medium' },
	}
	let release = () => {}
	const submit = new Promise<void>((resolve) => {
		release = resolve
	})
	await page.route('**/*', async (route) => {
		const url = new URL(route.request().url())
		if (url.origin !== base.origin) return route.abort()
		if (url.pathname === '/v1/guest/session') {
			return route.fulfill({
				json: { issued: true },
				headers: { 'Set-Cookie': '__Host-puzzled_guest=fixture-guest; Path=/; Secure; HttpOnly' },
			})
		}
		if (!url.pathname.startsWith('/puzzled.v1.')) return route.continue()
		switch (url.pathname.split('/').pop()) {
			case 'GetDaily':
				if (scenario === 'locked')
					return route.fulfill({
						status: 403,
						json: { code: 'permission_denied', message: 'plus_required' },
					})
				return route.fulfill({
					json: calls.submits
						? { ...daily, ...completed }
						: { ...daily, requiresStart: !calls.starts },
				})
			case 'StartDaily':
				calls.starts++
				return route.fulfill({ json: { daily } })
			case 'SubmitGuess':
				calls.submits++
				await submit
				return route.fulfill({ json: { gameSlug, valid: true, status: 'won', score: 5 } })
			default:
				return route.fulfill({ json: {} })
		}
	})
	await page.setExtraHTTPHeaders({ 'CF-IPCountry': 'DE' })
	return { calls, release }
}

async function expectUncovered(target: Locator, consent: Locator, size: number) {
	await expect(target).toBeInViewport({ ratio: 1 })
	const bottom = (await consent.boundingBox())?.y
	expect(bottom).toBeDefined()
	const hit = await target.evaluate((node) => {
		const { x, y, width, height } = node.getBoundingClientRect()
		return {
			width,
			height,
			bottom: y + height,
			hit: node.contains(document.elementFromPoint(x + width / 2, y + height / 2)),
		}
	})
	expect(hit.width).toBeGreaterThanOrEqual(size)
	expect(hit.height).toBeGreaterThanOrEqual(size)
	expect(hit.bottom).toBeLessThanOrEqual(bottom!)
	expect(hit.hit).toBe(true)
}

const path = (locale: string) => `/${locale}/games/nonogram?difficulty=medium&start=1#play`
for (const touch of [false, true]) {
	test.describe(touch ? '390×844' : '1440×900', () => {
		test.use({
			viewport: touch ? { width: 390, height: 844 } : { width: 1440, height: 900 },
			hasTouch: touch,
			isMobile: touch,
			serviceWorkers: 'block',
		})
		test('Paint mode cue stays off the grid and out of a same-day resume', async ({
			page,
			baseURL,
		}, testInfo) => {
			const { calls } = await fixture(page, baseURL, 'play')
			const press = (target: Locator) => (touch ? target.tap() : target.click())
			const cue = page.locator('[data-paint-mode-cue]')
			const fill = buttons(page).getByRole('button', { name: 'Fill', exact: true })
			const mark = buttons(page).getByRole('button', { name: 'Mark', exact: true })
			const first = cell(page, 0, 0)
			const second = cell(page, 0, 1)
			const unblocked = async () => {
				await expect(board(page)).toBeInViewport({ ratio: 1 })
				await expectUncovered(first, banner(page), 26)
				await expectUncovered(cell(page, 9, 9), banner(page), 26)
				await expectUncovered(
					cue.getByRole('button', { name: 'Dismiss', exact: true }),
					banner(page),
					44,
				)
				await expect(page.locator('dialog[open]')).toHaveCount(0)
			}
			const capture = async (name: string) =>
				testInfo.attach(name, {
					body: await page.screenshot({ animations: 'disabled' }),
					contentType: 'image/png',
				})
			await page.goto(path('en-US'))
			await press(page.locator('[data-game-stage="start"] button'))
			await expect(cue.getByRole('status')).toHaveText('Mode: Fill')
			await expect(fill).toHaveAttribute('aria-pressed', 'true')
			await expect(fill.locator('svg').last()).toBeVisible()
			await expect(mark.locator('svg').last()).toBeHidden()
			await unblocked()
			await capture('paint-mode-before-input')
			await press(first)
			await expect(cue).toBeHidden()
			// Touch gets a new public row mismatch; desktop gets a keyboard self-clear.
			const mistake = touch ? second : first
			if (touch) await press(mistake)
			else await mistake.press('Space')
			await expect(cue.getByRole('status')).toHaveText('Switch to Mark for empty squares.')
			await expect(mistake).toHaveAttribute('aria-pressed', touch ? 'true' : 'false')
			await expect(fill).toHaveAttribute('aria-pressed', 'true')
			await unblocked()
			await capture('paint-mark-after-mistake')
			await press(cue.getByRole('button', { name: 'Dismiss', exact: true }))
			await expect(cue).toBeHidden()
			await page.reload()
			await expect(mistake).toHaveAttribute('aria-pressed', touch ? 'true' : 'false')
			if (touch) await press(buttons(page).getByRole('button', { name: 'Undo', exact: true }))
			else await press(first)
			await press(mistake)
			await expect(mistake).toHaveAttribute('aria-pressed', touch ? 'true' : 'false')
			await expect(cue).toBeHidden()
			expect(calls).toEqual({ starts: 1, submits: 0 })
		})
	})
}

for (const [
	locale,
	[fillLabel, markLabel, fillCue, markCue, undoLabel, resetLabel],
] of Object.entries(copy)) {
	const touch = locale !== 'en-US'
	test.describe(locale, () => {
		test.use({
			locale,
			viewport: touch ? { width: 390, height: 844 } : { width: 1440, height: 900 },
			hasTouch: touch,
			isMobile: touch,
			serviceWorkers: 'block',
		})
		test('Paint explains its first input without covering the grid', async ({ page, baseURL }) => {
			const { calls } = await fixture(page, baseURL, 'play')
			const press = (target: Locator) => (touch ? target.tap() : target.click())
			await page.goto(path(locale))
			const consent = banner(page)
			await expect(consent).toBeVisible()
			await expect(board(page)).toHaveCount(0)
			await expect(buttons(page)).toHaveCount(0)
			expect(calls.starts).toBe(0)
			await press(page.locator('[data-game-stage="start"] button'))
			const fill = buttons(page).getByRole('button', { name: fillLabel, exact: true })
			const mark = buttons(page).getByRole('button', { name: markLabel, exact: true })
			await expect(fill.getByText(fillCue, { exact: true })).toBeVisible()
			await expect(mark.getByText(markCue, { exact: true })).toBeVisible()
			await expect(fill).toHaveAccessibleDescription(fillCue)
			await expect(mark).toHaveAccessibleDescription(markCue)
			await expect(fill).toHaveAttribute('aria-pressed', 'true')
			await expect(mark).toHaveAttribute('aria-pressed', 'false')
			await expect(board(page)).toBeInViewport({ ratio: 1 })
			await expectUncovered(fill, consent, 48)
			await expectUncovered(mark, consent, 48)
			const first = cell(page, 0, 0)
			await expectUncovered(first, consent, 26)
			await expect(first).toHaveAttribute('aria-pressed', 'false')
			await expect(page.locator('dialog[open]')).toHaveCount(0)
			if (touch) await press(first)
			else {
				await cell(page, 0, 1).focus()
				await page.keyboard.press('ArrowLeft')
				await expect(first).toBeFocused()
				await page.keyboard.press('Space')
			}
			await expect(first).toHaveAttribute('aria-pressed', 'true')
			await press(mark)
			await expect(mark).toHaveAttribute('aria-pressed', 'true')
			await expect(fill).toHaveAttribute('aria-pressed', 'false')
			const second = cell(page, 0, 1)
			await press(second)
			await expect(second).toHaveAttribute('aria-pressed', 'mixed')
			await expect(second).not.toHaveAttribute('data-filled', 'true')
			if (undoLabel && resetLabel) {
				await page.reload()
				await expect(mark).toHaveAttribute('aria-pressed', 'true')
				await expect(first).toHaveAttribute('aria-pressed', 'true')
				await expect(second).toHaveAttribute('aria-pressed', 'mixed')
				await press(buttons(page).getByRole('button', { name: undoLabel, exact: true }))
				await expect(second).toHaveAttribute('aria-pressed', 'false')
				await expect(first).toHaveAttribute('aria-pressed', 'true')
				await press(buttons(page).getByRole('button', { name: resetLabel, exact: true }))
				await expect(first).toHaveAttribute('aria-pressed', 'false')
			}
			expect(calls).toEqual({ starts: 1, submits: 0 })
		})
	})
}

test('Paint locks the brushes while submitting and does not reopen a finished board', async ({
	page,
	baseURL,
}) => {
	const { calls, release } = await fixture(page, baseURL, 'finish')
	await page.goto(path('en-US'))
	await page.locator('[data-game-stage="start"] button').click()
	try {
		await cell(page, 0, 0).click()
		await expect.poll(() => calls.submits).toBe(1)
		await expect(cell(page, 0, 1)).toBeDisabled()
		for (const name of ['Fill', 'Mark']) {
			const brush = buttons(page).getByRole('button', { name, exact: true })
			await expect(brush).toBeDisabled()
			await expect(brush).not.toHaveAttribute('aria-describedby', /.+/)
		}
	} finally {
		release()
	}
	await expect(page.locator('[data-board-finished]')).toBeVisible()
	await expect(buttons(page).getByText(copy['en-US'][2], { exact: true })).toBeHidden()
	await page.evaluate((key) => localStorage.removeItem(key), PAINT_MODE_CUE_SEEN_DAY_KEY)
	await page.reload()
	await expect(page.locator('[data-game-stage="completed"]')).toBeVisible()
	await expect(page.locator('[data-paint-mode-cue]')).toHaveCount(0)
	await expect(board(page)).toHaveCount(0)
	await expect(page.locator('[data-game-stage="start"]')).toHaveCount(0)
	expect(calls).toEqual({ starts: 1, submits: 1 })
})

test('Paint shows no brushes without a playable board', async ({ page, baseURL }) => {
	const { calls } = await fixture(page, baseURL, 'locked')
	await page.goto(path('en-US'))
	await expect(page.locator('[data-unlock-panel="picks"]')).toBeVisible()
	await expect(board(page)).toHaveCount(0)
	await expect(buttons(page)).toHaveCount(0)
	expect(calls).toEqual({ starts: 0, submits: 0 })
})
