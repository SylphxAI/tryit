import { expect, test } from '@playwright/test'
import en from '../src/messages/en-US/catalog.json'
import ja from '../src/messages/ja/catalog.json'
import hk from '../src/messages/zh-HK/catalog.json'
import { DESKTOP, MOBILE } from './a11y-support'

const NARROW = { width: 320, height: 740 }
const categories = ['all', 'word', 'logic', 'math', 'spatial'] as const
const locales = [
	{ prefix: '', lang: 'en-US', copy: en },
	{ prefix: '/ja', lang: 'ja', copy: ja },
	{ prefix: '/zh-HK', lang: 'zh-HK', copy: hk },
] as const

test.describe('Server-rendered catalog entry', () => {
	test.use({ javaScriptEnabled: false, contextOptions: { reducedMotion: 'reduce' } })

	for (const { prefix, lang, copy } of locales) {
		for (const viewport of lang === 'ja' ? [NARROW, MOBILE, DESKTOP] : [MOBILE, DESKTOP]) {
			test(`${lang} at ${viewport.width}px keeps search and all five filters usable`, async ({
				page,
			}) => {
				const path = `${prefix}/games`
				await page.setViewportSize(viewport)
				expect((await page.goto(path))?.status()).toBe(200)
				await expect(page.locator('html')).toHaveAttribute('lang', lang)
				const main = page.getByRole('main')
				const cards = main.locator('[data-game-tile]')
				await expect(cards).toHaveCount(19)
				const search = main.getByRole('searchbox', { name: copy.searchLabel })
				const submit = main.getByRole('button', { name: copy.searchSubmit })
				const filters = main.getByRole('group', { name: copy.filterLabel }).getByRole('link')
				await expect(filters).toHaveText([copy.filterAll, ...Object.values(copy.category)])
				await expect(filters.first()).toHaveAttribute('aria-current', 'page')

				await page.evaluate(() => document.fonts.ready.then(() => true))
				expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(viewport.width)
				expect((await cards.first().boundingBox())?.y).toBeLessThanOrEqual(
					viewport === NARROW ? 420 : 360,
				)
				expect(
					await search.evaluate((element: HTMLInputElement) => {
						const style = getComputedStyle(element)
						const text = document.createElement('span')
						text.style.cssText = 'position:fixed;visibility:hidden;white-space:pre'
						text.style.font = style.font
						text.style.letterSpacing = style.letterSpacing
						text.textContent = element.placeholder
						document.body.append(text)
						const fits =
							text.getBoundingClientRect().width <=
							element.clientWidth - parseFloat(style.paddingLeft) - parseFloat(style.paddingRight)
						text.remove()
						return fits
					}),
				).toBe(true)
				const inputBox = (await search.boundingBox())!
				const submitBox = (await submit.boundingBox())!
				expect(inputBox.x + inputBox.width).toBeLessThan(submitBox.x)

				await search.focus()
				for (const control of [search, submit, ...(await filters.all())]) {
					await expect(control).toBeFocused()
					await expect(control).toHaveCSS('outline-style', 'solid')
					await expect(control).toHaveCSS('outline-width', '2px')
					const box = (await control.boundingBox())!
					expect(box.width).toBeGreaterThanOrEqual(48)
					expect(box.height).toBeGreaterThanOrEqual(48)
					// Leave room for the entire 2px ring and 2px offset on either side.
					expect(box.x).toBeGreaterThanOrEqual(4)
					expect(box.x + box.width + 4).toBeLessThanOrEqual(viewport.width)
					await page.keyboard.press('Tab')
				}
				for (const [index, category] of categories.entries()) {
					await expect(filters.nth(index)).toHaveAttribute(
						'href',
						category === 'all' ? path : `${path}?category=${category}`,
					)
				}

				// Use the actual translated title, then reload this shareable GET URL.
				await filters.last().press('Enter')
				await expect(page).toHaveURL(new URL(`${path}?category=spatial`, page.url()).href)
				await expect(filters.last()).toHaveAttribute('aria-current', 'page')
				const title = await cards
					.and(page.locator('[data-game-tile="block-slide"]'))
					.getByRole('heading')
					.textContent()
				if (!title) throw new Error('Missing translated Blocks title')
				await search.fill(title.trim())
				await search.press('Enter')
				const filteredUrl = new URL(page.url())
				expect(filteredUrl.searchParams.get('q')).toBe(title.trim())
				expect(filteredUrl.searchParams.get('category')).toBe('spatial')
				await expect(cards).toHaveCount(1)
				await expect(cards.first()).toHaveAttribute('href', `${path}/block-slide`)
				await page.reload()
				await expect(search).toHaveValue(title.trim())
				await expect(cards).toHaveCount(1)

				await filters.nth(1).press('Enter')
				await expect(filters.nth(1)).toHaveAttribute('aria-current', 'page')
				await expect(search).toHaveValue(title.trim())
				await expect(cards).toHaveCount(0)
				await expect(main.getByText(copy.emptyTitle, { exact: true })).toBeVisible()
				await main.getByRole('link', { name: copy.clearFilter, exact: true }).last().press('Enter')
				await expect(page).toHaveURL(new URL(path, page.url()).href)
				await expect(search).toHaveValue('')
				await expect(cards).toHaveCount(19)
			})
		}
	}
})

test('opening a catalog tile stays passive and can show a playable board', async ({ page }) => {
	const writes: string[] = []
	await page.route(/\/(?:v1\/guest\/session|puzzled\.v1\.PuzzleService\/StartDaily)$/, (route) => {
		writes.push(new URL(route.request().url()).pathname)
		return route.abort()
	})
	await page.goto('/games')
	const tile = page.locator('[data-game-tile="word-guess"]')
	await expect(tile).toHaveAttribute('href', '/games/word-guess')
	await expect(page.locator('[data-game-tile][data-start-intent]')).toHaveCount(0)
	await tile.click()
	await expect(page).toHaveURL(/\/games\/word-guess$/)
	await expect(page.locator('a[data-start-intent="word-guess"]')).toHaveAttribute(
		'href',
		'/games/word-guess?start=1#play',
	)
	// The CI fixture serves a frozen playable board; selecting this card need not start a new run.
	await expect(
		page.locator('#play [data-game-stage="board"]').getByRole('table', { name: 'Five' }),
	).toBeVisible()
	expect(writes).toEqual([])
})
