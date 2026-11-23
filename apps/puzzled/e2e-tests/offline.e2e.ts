import { expect, test } from '@playwright/test'

const offlineCopy = {
	'en-US': ["You're offline", 'Try again'],
	'en-GB': ["You're offline", 'Try again'],
	es: ['Sin conexión', 'Volver a intentar'],
	ja: ['オフラインです', 'もう一度試す'],
	'pt-BR': ['Você está sem conexão', 'Tentar novamente'],
	'zh-CN': ['你已离线', '重试'],
	'zh-HK': ['你而家離線', '再試一次'],
	'zh-TW': ['你目前離線', '再試一次'],
} as const

test('offline navigation uses the URL language and retry recovers the original URL', async ({
	page,
	context,
}) => {
	await page.goto('/')
	await page.evaluate(async () => {
		await navigator.serviceWorker.register('/sw.js', { scope: '/', updateViaCache: 'none' })
		await navigator.serviceWorker.ready
		if (!navigator.serviceWorker.controller) {
			await new Promise<void>((resolve) =>
				navigator.serviceWorker.addEventListener('controllerchange', () => resolve(), {
					once: true,
				}),
			)
		}
	})
	await context.setOffline(true)
	for (const [locale, [heading, retry]] of Object.entries(offlineCopy)) {
		const prefix = locale === 'en-US' ? '' : '/' + locale
		await page.goto(prefix + '/games/sudoku?offline-check=1')
		await expect(page.locator('html')).toHaveAttribute('lang', locale)
		await expect(page.getByRole('heading', { name: heading })).toBeVisible()
		await expect(page.getByRole('img', { name: 'Tryit' })).toBeVisible()
		await expect(page.getByRole('link', { name: retry })).toBeVisible()
	}
	const path = '/zh-TW/games/sudoku?offline-check=1'
	const heading = page.getByRole('heading', { name: '你目前離線' })
	const retry = page.getByRole('link', { name: '再試一次' })
	await retry.click()
	await expect(heading).toBeVisible()
	await expect(page).toHaveURL(new RegExp(path.replace('?', '\\?') + '$'))
	const cached = await page.evaluate(async () =>
		(await (await caches.open('puzzled-offline-v2')).keys()).map((request) => {
			const url = new URL(request.url)
			return url.pathname + url.search
		}),
	)
	expect(cached).toEqual(['/offline.html?format=bundle'])
	await context.setOffline(false)
	await retry.click()
	await expect(heading).toHaveCount(0)
	await expect(page).toHaveURL(new RegExp(path.replace('?', '\\?') + '$'))
})
