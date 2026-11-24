import { expect, test } from '@playwright/test'
import { productDayKey } from '../src/lib/product-day'

test('sharing a PNG without clipboard permission offers a selectable caption, without claiming it copied', async ({
	page,
}) => {
	await page.route('**/v1/guest/session', (route) => route.fulfill({ json: { issued: true } }))
	await page.route('**/puzzled.v1.PuzzleService/GetDaily', (route) =>
		route.fulfill({
			json: {
				gameSlug: 'sudoku',
				puzzleDate: productDayKey(),
				hasCompleted: true,
				canPlay: false,
				completedSession: { status: 'won', attempts: 1, score: 900, timeSpentMs: '34567' },
			},
		}),
	)
	await page.route('**/puzzled.v1.PuzzleService/ShareResult', (route) =>
		route.fulfill({ json: {} }),
	)
	await page.goto('/games/sudoku?difficulty=easy&start=1#play')
	await page.getByRole('button', { name: 'See your result' }).click()
	const dialog = page.getByRole('dialog', { name: 'Sudoku Complete' })
	const cdp = await page.context().newCDPSession(page)
	const { targetInfo } = await cdp.send('Target.getTargetInfo')
	await cdp.send('Browser.setPermission', {
		permission: { name: 'clipboard-write' },
		setting: 'denied',
		origin: new URL(page.url()).origin,
		browserContextId: targetInfo.browserContextId,
	})
	const download = page.waitForEvent('download')
	await dialog.getByRole('button', { name: 'Share Result', exact: true }).click()
	expect((await download).suggestedFilename()).toMatch(
		/^tryit-result-sudoku-\d{4}-\d{2}-\d{2}\.png$/,
	)
	await expect(dialog.getByRole('status')).toHaveText('Card image saved.')
	await expect(dialog.getByText(/caption copied/i)).toHaveCount(0)
	const caption = dialog.getByRole('textbox', { name: 'Result caption' })
	const value = await caption.inputValue()
	expect(value).toContain('/games/sudoku')
	await caption.focus()
	expect(
		await caption.evaluate((el: HTMLTextAreaElement) => el.selectionEnd - el.selectionStart),
	).toBe(value.length)
})
