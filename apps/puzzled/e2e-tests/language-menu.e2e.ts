import { expect, test } from '@playwright/test'
import { DESKTOP, languageOptions, languageTrigger } from './a11y-support'
import { serveSudoku } from './sudoku-fixture'

test.use({ viewport: DESKTOP })

test('language links are navigable even without hydration', async ({ browser, baseURL }) => {
	const context = await browser.newContext({ javaScriptEnabled: false, baseURL, viewport: DESKTOP })
	try {
		const page = await context.newPage()
		await page.goto('/')
		await expect(languageTrigger(page)).toHaveText('English')
		await expect(languageOptions(page)).toBeHidden()
		await languageTrigger(page).press('Enter')
		const spanish = languageOptions(page).getByRole('link', { name: 'Español' })
		await expect(spanish).toBeVisible()
		await spanish.press('Enter')
		await expect(page).toHaveURL('/es')
		await expect(page.locator('html')).toHaveAttribute('lang', 'es')
	} finally {
		await context.close()
	}
})

test('guest admission leaves an open language disclosure in place', async ({ page }) => {
	await serveSudoku(page, { requiresStart: true })
	let release!: () => void
	const admission = new Promise<void>((resolve) => {
		release = resolve
	})
	await page.route('**/v1/guest/session', async (route) => {
		await admission
		await route.fulfill({
			json: { issued: true },
			headers: { 'set-cookie': 'puzzled-test-admission=1; Path=/; SameSite=Lax' },
		})
	})
	try {
		await page.goto('/games/sudoku?difficulty=easy&start=1#play')
		const requested = page.waitForRequest('**/v1/guest/session')
		await page.locator('[data-game-stage="start"]').getByRole('button').click()
		await requested
		const trigger = languageTrigger(page)
		await trigger.press('Enter')
		const options = languageOptions(page)
		await expect(options).toBeVisible()
		const sameHeader = await page.locator('header').elementHandle()
		release()
		await expect(page.getByRole('group', { name: 'Sudoku', exact: true })).toBeVisible()
		expect(
			await sameHeader!.evaluate((element) => element === document.querySelector('header')),
		).toBe(true)
		await expect(options).toBeVisible()
		await expect(trigger).toBeFocused()
		await page.keyboard.press('Escape')
		await expect(options).toBeHidden()
		await expect(trigger).toBeFocused()
	} finally {
		release()
	}
})
