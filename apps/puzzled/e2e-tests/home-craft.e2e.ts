import { expect, test } from '@playwright/test'
import { DESKTOP, languageTrigger, MOBILE, settle } from './a11y-support'

for (const viewport of [
	{ width: 1440, height: 757 },
	{ width: 1440, height: 900 },
	{ width: 768, height: 1024 },
	{ width: 390, height: 844 },
	{ width: 375, height: 667 },
]) {
	test(`home craft at ${viewport.width}x${viewport.height}`, async ({ page }, info) => {
		await page.setViewportSize(viewport)
		await page.goto('/')
		const primaryAction = page.locator('[data-day-primary-action]')
		// Wait for SSR Suspense reveal ($RC -> $RV) to remove the hidden streaming container before strict visibility check.
		await expect(primaryAction).toHaveCount(1)
		await expect(primaryAction).toBeVisible()
		await settle(page)
		await expect(page.locator('[data-consent-banner]')).toBeVisible()
		await expect(languageTrigger(page)).toHaveText('English')
		const signIn = page.locator('header').getByRole('link', { name: 'Sign in', exact: true })
		await expect(signIn).toBeInViewport({ ratio: 1 })
		await signIn.click({ trial: true })
		for (const consentState of ['open', 'dismissed']) {
			if (consentState === 'dismissed') {
				await page.getByRole('button', { name: 'Decline', exact: true }).click()
			}
			await page.evaluate(() => window.scrollTo(0, 0))
			await page.screenshot({
				path: info.outputPath(`${consentState}-initial.jpg`),
				type: 'jpeg',
				quality: 55,
				fullPage: false,
			})
			expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(
				viewport.width,
			)
			const action = page.locator('[data-day-primary-action]')
			if (consentState === 'open') {
				const unobstructed = await action.evaluate((el) => {
					const r = el.getBoundingClientRect()
					const banner = document.querySelector('[data-consent-banner]')
					const b = banner?.getBoundingClientRect()
					const overlapsBanner =
						!!b &&
						b.width > 0 &&
						b.height > 0 &&
						r.left < b.right &&
						r.right > b.left &&
						r.top < b.bottom &&
						r.bottom > b.top
					const inView = r.top >= 0 && r.bottom <= window.innerHeight
					const hitCenter =
						!inView || el.contains(document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2))
					return { overlapsBanner, hitCenter }
				})
				expect(unobstructed.overlapsBanner).toBe(false)
				expect(unobstructed.hitCenter).toBe(true)
			}
			await action.evaluate((el) => el.scrollIntoView({ block: 'center' }))
			await expect(action).toBeInViewport({ ratio: 1 })
			await action.click({ trial: true })
			const actionBox = (await action.boundingBox())!
			// Tolerate Blink float32 subpixel rounding (e.g. 47.99997px on min-h-12).
			expect(Math.round(actionBox.height * 100) / 100).toBeGreaterThanOrEqual(48)
			await page.screenshot({
				path: info.outputPath(`${consentState}-play.jpg`),
				type: 'jpeg',
				quality: 55,
				fullPage: false,
			})
		}
	})
}

test('Chinese display type and reduced motion remain readable', async ({ page }, info) => {
	await page.setViewportSize({ width: 390, height: 844 })
	await page.emulateMedia({ reducedMotion: 'reduce', colorScheme: 'dark' })
	await page.goto('/zh-CN')
	const title = page.locator('.home-day-grid h1')
	// Wait for SSR Suspense reveal ($RC -> $RV) to remove the hidden streaming container.
	await expect(title).toHaveCount(1)
	await expect(title).toBeVisible()
	await settle(page)
	for (const selector of ['.home-day-grid h1', '.home-featured-title']) {
		const type = await page.locator(selector).evaluate((el) => {
			const style = getComputedStyle(el)
			return {
				tracking: style.letterSpacing,
				ratio: Number.parseFloat(style.lineHeight) / Number.parseFloat(style.fontSize),
			}
		})
		// Chromium reports a zero letter-spacing as the keyword `normal`.
		expect(['normal', '0px']).toContain(type.tracking)
		expect(type.ratio).toBeGreaterThanOrEqual(1.29)
	}
	await expect(languageTrigger(page)).toHaveText('简体中文')
	const lineupCard = page.locator('[data-home-game="nonogram"]')
	await lineupCard.hover()
	await expect(lineupCard.locator('img')).toHaveCSS('transform', 'none')
	await expect(lineupCard.locator('..')).toHaveCSS('animation-name', 'none')
	const card = page.locator('.home-featured-card')
	await card.hover()
	await expect(card).toHaveCSS('transform', 'none')
	await page.screenshot({
		path: info.outputPath('chinese-dark-reduced-motion.jpg'),
		type: 'jpeg',
		quality: 55,
		fullPage: false,
	})
})

for (const viewport of [
	{ width: 390, height: 844 },
	{ width: 1440, height: 900 },
]) {
	test(`the lineup loads 18 distinct SVGs before scrolling at ${viewport.width}×${viewport.height}`, async ({
		page,
	}) => {
		await page.setViewportSize(viewport)
		await page.goto('/', { waitUntil: 'load' })
		const motifs = page.locator('[data-home-game] img')
		await expect(motifs).toHaveCount(18)
		const images = await motifs.evaluateAll((nodes: HTMLImageElement[]) =>
			nodes.map((image) => ({
				slug: image.closest('a')?.dataset.homeGame,
				src: image.getAttribute('src'),
				alt: image.getAttribute('alt'),
				loading: image.getAttribute('loading'),
				width: image.naturalWidth,
				tint: getComputedStyle(image.parentElement!).backgroundColor,
			})),
		)
		expect(new Set(images.map(({ slug }) => slug)).size).toBe(18)
		expect(images.map(({ slug }) => slug)).not.toContain(
			await page.locator('[data-home-featured]').getAttribute('data-home-featured'),
		)
		expect(new Set(images.map(({ tint }) => tint)).size).toBeGreaterThanOrEqual(10)
		expect(images.map(({ slug }) => slug)).toEqual(
			expect.arrayContaining(['cryptogram', 'word-box', 'word-hive']),
		)
		for (const image of images) {
			expect(image).toMatchObject({
				src: `/motifs/${image.slug}-zoom.svg`,
				alt: '',
				loading: null,
			})
			expect(image.width, image.slug).toBeGreaterThan(0)
		}
		expect(await page.evaluate(() => window.scrollY)).toBe(0)
	})
}

test('the lineup cards keep a stationary hit target', async ({ page }) => {
	await page.setViewportSize({ width: 1440, height: 900 })
	await page.goto('/')

	const card = page.locator('[data-home-game="nonogram"]')
	await card.scrollIntoViewIfNeeded()
	await settle(page)
	const face = card.locator(':scope > div')
	const motif = face.locator('img')
	const hitbox = await card.boundingBox()
	await card.hover()
	await expect(face).toHaveCSS('transform', 'matrix(1, 0, 0, 1, 0, -2)')
	await expect(motif).toHaveCSS('transform', 'matrix(1.035, 0, 0, 1.035, 0, 0)')
	await page.mouse.down()
	try {
		await expect(face).toHaveCSS('transform', 'matrix(0.985, 0, 0, 0.985, 0, 0)')
		expect(await card.boundingBox()).toEqual(hitbox)
	} finally {
		// Release off-card so this assertion doesn't also start a game.
		await page.mouse.move(0, 0)
		await page.mouse.up()
	}
})

test('Taiwan home and all 19 catalog tiles use local names and minute badges', async ({ page }) => {
	await page.goto('/zh-TW')
	const featured = page.locator('.home-featured-title')
	await expect(featured).toHaveText(/^\p{Script=Han}+$/u)
	await expect(page.locator('[data-day-primary-action]')).toHaveText(
		`遊玩今日的「${await featured.textContent()}」`,
	)
	await expect(page.getByRole('heading', { level: 1 })).toHaveText(
		'每天 19 款謎題，任選 3 款免費玩，不用註冊。',
	)
	await expect(page.getByText('今日免費已選 0 / 3 款')).toBeVisible()
	await expect(page.getByText(/今天已有 .* 位玩家完成/)).toHaveCount(0)
	await expect(page.getByRole('link', { name: '跳至主要內容', exact: true })).toHaveAttribute(
		'href',
		'#main-content',
	)

	await page.goto('/zh-TW/games')
	const tiles = page.locator('main [data-game-tile]')
	await expect(tiles).toHaveCount(19)
	for (const [slug, name, minutes] of [
		['arithmo', '算式猜謎', 3],
		['block-slide', '華容道', 5],
		['crossword', '迷你填字', 5],
		['cryptogram', '密碼文', 5],
		['killer-sudoku', '殺手數獨', 10],
		['nonogram', '數繪', 8],
		['number-path', '數字連線', 5],
		['pattern-match', '圖卡配對', 4],
		['pip-place', '骨牌拼圖', 5],
		['quad-words', '四詞同猜', 5],
		['crowns', '皇冠', 5],
		['sudoku', '數獨', 10],
		['duo', '日月平衡', 5],
		['word-box', '字母方框', 5],
		['word-groups', '詞語分組', 3],
		['word-guess', '五字母猜詞', 2],
		['word-hive', '字母蜂巢', 5],
		['word-ladder', '單字階梯', 3],
		['word-search', '字母尋詞', 5],
	] as const) {
		const tile = page.locator(`main [data-game-tile="${slug}"]`)
		await expect(tile.getByRole('heading', { name, exact: true })).toBeVisible()
		await expect(tile.getByText(`約 ${minutes} 分鐘`, { exact: true })).toBeVisible()
	}
	await page.goto('/zh-TW/games/crowns')
	await expect(page.getByRole('heading', { name: '皇冠', exact: true, level: 1 })).toBeVisible()
	await expect(page.getByText('約 5 分鐘', { exact: true }).first()).toBeVisible()
})

test('Japanese shell localizes the skip link and corporate footer', async ({ page }) => {
	await page.goto('/ja')
	await expect(page.getByRole('link', { name: 'メインコンテンツへスキップ' })).toHaveAttribute(
		'href',
		'#main-content',
	)
	await expect(page.locator('footer small')).toContainText('会社登録番号：16438428')
	await expect(page.locator('footer small')).not.toContainText('Registered in England and Wales')
})

for (const viewport of [
	{ width: 1280, height: 800 },
	DESKTOP,
	{ width: 1920, height: 937 },
	{ width: 1920, height: 1080 },
	MOBILE,
]) {
	test(`Taiwan home CTA and hero promise clear the initial dock at ${viewport.width}x${viewport.height}`, async ({
		page,
	}) => {
		await page.setViewportSize(viewport)
		await page.setExtraHTTPHeaders({ 'CF-IPCountry': 'DE' })
		await page.goto('/zh-TW')
		const action = page.locator('[data-day-primary-action]')
		const note = page.getByRole('heading', { level: 1 })
		const dock = page.locator('[data-consent-banner]')
		await expect(action).toBeVisible()
		await expect(action).toHaveText(/遊玩今日的/u)
		await expect(note).toBeVisible()
		await expect(dock).toBeVisible()
		await settle(page)
		await page.evaluate(() => document.fonts.ready.then(() => undefined))

		const top = (await dock.boundingBox())!.y
		for (const target of [action, note]) {
			const { y, height } = (await target.boundingBox())!
			expect(y).toBeGreaterThanOrEqual(0)
			// Include the action's pressed-key edge (3px of box shadow).
			expect(y + height + 3).toBeLessThanOrEqual(top)
		}
		expect(await page.evaluate(() => window.scrollY)).toBe(0)
	})
}
