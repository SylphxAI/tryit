import { expect, type Locator, type Page, test } from '@playwright/test'
import { productDayKey } from '../src/lib/product-day'
import { CONSENT_KEY, START_INTENT_KEY } from '../src/lib/storage-keys'

async function guardPlay(page: Page, origin: string) {
	const starts: string[] = []
	const puzzleDate = productDayKey()
	await page.context().route('**/*', (route) => {
		const request = route.request()
		const url = new URL(request.url())
		if (url.origin !== origin) return route.abort()
		switch (url.pathname) {
			case '/api/consent-context':
				return route.fulfill({ json: { region: 'EEA', gpc: false } })
			case '/v1/guest/session':
				return route.fulfill({
					json: { issued: true },
					headers: {
						'Set-Cookie': '__Host-puzzled_guest=lineup-fixture; HttpOnly; Secure; Path=/',
					},
				})
			case '/puzzled.v1.PuzzleService/GetDaily':
				return route.fulfill({
					json: { ...request.postDataJSON(), puzzleDate, canPlay: true, requiresStart: true },
				})
			case '/puzzled.v1.PuzzleService/StartDaily':
				starts.push(request.postDataJSON().gameSlug)
				return route.fulfill({ status: 503, json: { code: 'unavailable', message: 'fixture' } })
			// The route loader's same-origin server function reads the game document.
			case '/_server':
				return ['localhost', '127.0.0.1'].includes(url.hostname) ? route.continue() : route.abort()
			default:
				return ['document', 'script', 'stylesheet', 'image', 'font'].includes(
					request.resourceType(),
				) && request.method() === 'GET'
					? route.continue()
					: route.abort()
		}
	})
	return starts
}

const dock = (page: Page) => page.locator('[data-consent-banner]')
const lastCard = (page: Page) => page.locator('[data-home-game][data-start-intent]').last()
const cardPoint = (card: Locator) =>
	card.evaluate((el) => {
		const rect = el.getBoundingClientRect()
		const x = rect.left + rect.width / 2
		const y = rect.top + rect.height / 2
		return { x, y, hit: el.contains(document.elementFromPoint(x, y)) }
	})

async function openHome(page: Page, dismissed: boolean) {
	if (dismissed) await page.addInitScript((key) => localStorage.setItem(key, 'denied'), CONSENT_KEY)
	await page.goto('/')
	const countdown = page.locator('[data-home-countdown]')
	await expect(countdown).not.toHaveText((await countdown.textContent()) ?? '')
	if (dismissed) await expect(dock(page)).toBeHidden()
	else await expect(dock(page)).toBeVisible()
	await page.evaluate(() => document.fonts.ready.then(() => undefined))
	await expect
		.poll(() => page.locator('.site-shell').evaluate((el) => el.scrollTop + window.scrollY))
		.toBe(0)
}

test.use({ serviceWorkers: 'block', contextOptions: { reducedMotion: 'reduce' } })

for (const width of [1440, 390]) {
	const height = width === 1440 ? 900 : 844
	test.describe(`Home Back at ${width}×${height}`, () => {
		test.use({ viewport: { width, height }, isMobile: width === 390, hasTouch: width === 390 })
		for (const dismissed of [false, true]) {
			test(`restores the same card with consent ${dismissed ? 'denied' : 'unanswered'}`, async ({
				page,
				baseURL,
			}) => {
				const starts = await guardPlay(page, new URL(baseURL!).origin)
				await page.clock.install()
				await openHome(page, dismissed)
				const card = lastCard(page)
				const slug = (await card.getAttribute('data-home-game'))!
				const href = (await card.getAttribute('href'))!
				const sameCard = page.locator(`[data-home-game="${slug}"]`)
				const freeze = new Date(await page.evaluate(() => Date.now() + 10_000))
				await page.clock.pauseAt(freeze)
				await card.evaluate((el) => el.scrollIntoView({ block: 'center' }))
				const before = await cardPoint(card)
				expect(before.hit).toBe(true)
				// Trusted activation, with no browser timer advancing between the last scroll
				// and the press. The dock's trailing history write cannot have fired yet.
				if (width === 390) await page.touchscreen.tap(before.x, before.y)
				else await page.mouse.click(before.x, before.y)
				await page.clock.resume()

				await expect(page).toHaveURL(new URL(href, baseURL!).href)
				await expect(page.getByRole('heading', { name: 'Puzzle not available' })).toBeVisible()
				await expect
					.poll(() => page.locator('#play').evaluate((el) => el.getBoundingClientRect().top))
					.toBeCloseTo(0, 0)
				expect(starts).toEqual([slug])
				await page.goBack()
				await expect(page).toHaveURL(new URL('/', baseURL!).href)
				if (!dismissed) await expect(dock(page)).toBeVisible()
				await expect.poll(async () => (await cardPoint(sameCard)).hit).toBe(true)
				expect((await cardPoint(sameCard)).y).toBeCloseTo(before.y, 0)
				await expect(sameCard).toHaveAttribute('href', href)
				expect(starts).toEqual([slug])
				expect(
					await page.evaluate((key) => sessionStorage.getItem(key), START_INTENT_KEY),
				).toBeNull()
			})
		}
	})
}

test('a trusted modified card press leaves Home and Play intent untouched', async ({
	page,
	baseURL,
}) => {
	const starts = await guardPlay(page, new URL(baseURL!).origin)
	await page.clock.install()
	await openHome(page, false)
	const home = page.url()
	const card = lastCard(page)
	const target = new URL((await card.getAttribute('href'))!, home).href
	const freeze = new Date(await page.evaluate(() => Date.now() + 10_000))
	await page.clock.pauseAt(freeze)
	const original = await page.evaluate(() => history.state)
	await card.evaluate((el) => el.scrollIntoView({ block: 'center' }))
	const point = await cardPoint(card)
	expect(point.hit).toBe(true)
	// The shell and document handlers see the trusted press before window does.
	// Cancel only the browser's new-tab default here; CI need not load a background tab.
	const observed = await page.evaluateHandle(() => {
		const presses: unknown[] = []
		window.addEventListener(
			'click',
			(event) => {
				const { isTrusted, button, ctrlKey, defaultPrevented } = event
				const href = (event.target as Element).closest<HTMLAnchorElement>('a')?.href
				presses.push({ isTrusted, button, ctrlKey, defaultPrevented, href })
				event.preventDefault()
			},
			{ once: true },
		)
		return presses
	})
	await page.keyboard.down('Control')
	await page.mouse.click(point.x, point.y)
	await page.keyboard.up('Control')
	expect(await observed.jsonValue()).toEqual([
		{ isTrusted: true, button: 0, ctrlKey: true, defaultPrevented: false, href: target },
	])
	expect(await page.evaluate(() => history.state)).toEqual(original)
	expect(await page.evaluate((key) => sessionStorage.getItem(key), START_INTENT_KEY)).toBeNull()
	await page.clock.resume()
	await expect(page).toHaveURL(home)

	// Model the new tab's destination and referrer without depending on popup startup.
	await page.goto(target, { referer: home })
	await expectPlayWithoutStart(page, target)
	expect(starts).toEqual([])
})

test('a pasted lineup URL keeps the #play target but waits for Play', async ({ page, baseURL }) => {
	const starts = await guardPlay(page, new URL(baseURL!).origin)
	await openHome(page, false)
	const target = new URL((await lastCard(page).getAttribute('href'))!, page.url()).href
	await page.goto(target)
	await expectPlayWithoutStart(page, target)
	expect(starts).toEqual([])
})

async function expectPlayWithoutStart(page: Page, target: string) {
	expect(new URL(target).hash).toBe('#play')
	await expect(page).toHaveURL(target)
	await expect(
		page.locator('#play [data-game-stage="start"]').getByRole('button', { name: 'Play' }),
	).toBeEnabled()
}

test('ordinary navigation home does not restore the departed lineup position', async ({
	page,
	baseURL,
}) => {
	const starts = await guardPlay(page, new URL(baseURL!).origin)
	await openHome(page, false)
	await lastCard(page).click()
	await expect(page.getByRole('heading', { name: 'Puzzle not available' })).toBeVisible()
	await page.locator('.play-exit').click({ timeout: 5000 })
	await expect(page).toHaveURL(new URL('/games', baseURL!).href)
	await page.getByRole('link', { name: 'Tryit', exact: true }).click({ timeout: 5000 })
	await expect(page).toHaveURL(new URL('/', baseURL!).href)
	await expect(dock(page)).toBeVisible()
	await expect
		.poll(() => page.locator('.site-shell').evaluate((el) => el.scrollTop + window.scrollY))
		.toBe(0)
	expect(starts).toHaveLength(1)
})
