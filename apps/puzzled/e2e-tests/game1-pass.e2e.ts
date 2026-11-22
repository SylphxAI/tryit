import { expect, type Page, test } from '@playwright/test'

// The rotation starts with Word Guess on Jan 1; Sudoku is fourth.
const featuredDay = '2026-01-04'
const otherDay = '2026-01-05'
const solution = Array.from({ length: 9 }, (_, r) =>
	Array.from({ length: 9 }, (_, c) => ((r * 3 + Math.floor(r / 3) + c) % 9) + 1),
)
const puzzleDataJson = JSON.stringify({
	grid: solution.map((row, r) => row.map((v, c) => (r === 8 && c === 8 ? null : v))),
	difficulty: 'easy',
})
const subscriptionRpc = '**/puzzled.v1.BillingService/GetSubscription'
const variants = [
	{
		prefix: '',
		play: 'Play',
		cell: 'Row 9, Column 9',
		share: 'Share',
		label: /^Unlock all \d+ games and the 30-day archive with a 3-day pass$/,
		viewport: { width: 1280, height: 900 },
	},
	{
		prefix: '/zh-HK',
		play: '開始遊戲',
		cell: '第 9 行, 第 9 列',
		share: '分享',
		label: /^用 3 日通行證解鎖全部 \d+ 款遊戲同過去 30 日嘅題庫$/,
		viewport: { width: 360, height: 750 },
	},
] as const

function gate() {
	let release!: () => void
	const ready = new Promise<void>((resolve) => {
		release = resolve
	})
	return { ready, release }
}

async function setup(
	page: Page,
	options: {
		puzzleDate?: string
		completed?: boolean
		submitPending?: Promise<void>
		billingPending?: Promise<void>
		billing?: 'eligible' | 'entitled' | 'closed' | 'unavailable'
	} = {},
) {
	const puzzleDate = options.puzzleDate ?? featuredDay
	const daily = { gameSlug: 'sudoku', puzzleDate, canPlay: true, difficulty: 'easy' }
	const calls = { starts: 0, submissions: 0, entitlement: 0 }
	await page.route('**/v1/guest/session', (route) => route.fulfill({ json: { issued: true } }))
	await page.route('**/puzzled.v1.FunnelService/RecordEvent', (route) =>
		route.fulfill({ json: {} }),
	)
	await page.route('**/puzzled.v1.PuzzleService/GetDaily', (route) =>
		route.fulfill({
			json: options.completed
				? { ...daily, canPlay: false, completedSession: { status: 'won', attempts: 1 } }
				: { ...daily, requiresStart: true },
		}),
	)
	await page.route('**/puzzled.v1.PuzzleService/StartDaily', (route) => {
		calls.starts++
		return route.fulfill({ json: { daily: { ...daily, puzzleDataJson } } })
	})
	await page.route('**/puzzled.v1.PuzzleService/SubmitGuess', async (route) => {
		calls.submissions++
		expect(route.request().postDataJSON()).toMatchObject({ puzzleDate, status: 'won' })
		await options.submitPending
		await route.fulfill({ json: { valid: true, status: 'won', score: 900, gameSlug: 'sudoku' } })
	})
	await page.route('**/puzzled.v1.PuzzleService/ShareResult', (route) =>
		route.fulfill({ json: { shareId: 'fixture-share' } }),
	)
	await page.route(subscriptionRpc, async (route) => {
		calls.entitlement++
		await options.billingPending
		if (options.billing === 'unavailable') {
			await route.fulfill({ status: 503, json: { code: 'unavailable', message: 'fixture outage' } })
		} else {
			await route.fulfill({
				json: { salesOpen: options.billing !== 'closed', entitled: options.billing === 'entitled' },
			})
		}
	})
	return calls
}

const gamePath = '/games/sudoku?difficulty=easy&start=1'
const boardStage = '[data-game-stage="board"]'

async function play(
	page: Page,
	variant: (typeof variants)[number] = variants[0],
	archiveDate?: string,
) {
	await page.goto(`${variant.prefix}${gamePath}${archiveDate ? `&date=${archiveDate}` : ''}#play`)
	await page
		.locator('[data-game-stage="start"]')
		.getByRole('button', { name: variant.play, exact: true })
		.click()
	const board = page.locator(boardStage)
	await expect(board).toBeVisible()
	return board
}

for (const variant of variants) {
	test(`the pass is secondary to Share and leads to localized pricing (${variant.prefix || 'en-US'})`, async ({
		page,
	}) => {
		await page.setViewportSize(variant.viewport)
		const submit = gate()
		const billing = gate()
		const calls = await setup(page, { submitPending: submit.ready, billingPending: billing.ready })
		try {
			const board = await play(page, variant)
			const share = board.getByRole('button', { name: variant.share, exact: true })
			const offer = board.getByRole('link', { name: variant.label })
			expect(calls).toEqual({ starts: 1, submissions: 0, entitlement: 0 })
			await board.getByRole('button', { name: variant.cell, exact: true }).click()
			await page.keyboard.press(String(solution[8][8]))
			await expect.poll(() => calls.submissions).toBe(1)
			await expect(share).toHaveCount(0)
			await expect(offer).toHaveCount(0)
			expect(calls.entitlement).toBe(0)
			submit.release()
			await expect(share).toBeEnabled()
			await expect.poll(() => calls.entitlement).toBe(1)
			await expect(offer).toHaveCount(0)
			billing.release()

			await expect(offer).toBeVisible()
			const pricing = `${variant.prefix}/pricing`
			await expect(offer).toHaveAttribute('href', pricing)
			const shareBox = await share.boundingBox()
			const offerBox = await offer.boundingBox()
			if (!shareBox || !offerBox) throw new Error('Result actions are not painted')
			expect(offerBox.y).toBeGreaterThanOrEqual(shareBox.y + shareBox.height)
			expect(offerBox.height).toBeGreaterThanOrEqual(44)
			expect(offerBox.x + offerBox.width).toBeLessThanOrEqual(variant.viewport.width)
			await offer.focus()
			await expect(offer).toBeFocused()
			await share.locator('..').screenshot({ path: test.info().outputPath('result-actions.png') })
			await page.keyboard.press('Enter')
			await expect(page).toHaveURL(new RegExp(`${pricing}$`))
			await expect(page.locator('[data-pricing-page]')).toBeVisible()
			expect(calls.entitlement).toBe(1)
		} finally {
			submit.release()
			billing.release()
		}
	})
}

for (const billing of [
	'entitled',
	'closed',
	'unavailable',
	'nonfeatured',
	'archive',
	'reopened',
] as const) {
	test(`no pass offer for ${billing} results`, async ({ page }) => {
		const shouldRead = billing === 'entitled' || billing === 'closed' || billing === 'unavailable'
		const calls = await setup(page, {
			puzzleDate: billing === 'nonfeatured' ? otherDay : featuredDay,
			completed: billing === 'reopened',
			billing: shouldRead ? billing : undefined,
		})
		if (billing === 'reopened') {
			await page.goto(`${gamePath}#play`)
		} else {
			const board = await play(page, variants[0], billing === 'archive' ? featuredDay : undefined)
			const response = shouldRead ? page.waitForResponse(subscriptionRpc) : undefined
			await board.getByRole('button', { name: variants[0].cell, exact: true }).click()
			await page.keyboard.press(String(solution[8][8]))
			await (await response)?.finished()
		}
		const result = page.locator(
			billing === 'reopened' ? '[data-game-stage="completed"]' : boardStage,
		)
		await expect(result.getByRole('button', { name: 'Share', exact: true })).toBeEnabled()
		// Let any client-side finish effects settle before asserting absence.
		await page.evaluate(
			() =>
				new Promise<void>((resolve) =>
					requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
				),
		)
		await expect(result.getByRole('link', { name: variants[0].label })).toHaveCount(0)
		expect(calls.entitlement).toBe(shouldRead ? 1 : 0)
	})
}
