import { expect, test } from '@playwright/test'
import { COMPARISON_SLUGS } from '../src/features/marketing/components/comparison-slugs'
import { DESKTOP, MOBILE, settle } from './a11y-support'

const ROUTES = [
	'/en-GB',
	'/zh-TW',
	'/en-GB/pricing',
	'/vs',
	...COMPARISON_SLUGS.map((slug) => `/vs/${slug}`),
]

for (const viewport of [DESKTOP, MOBILE]) {
	for (const route of ROUTES) {
		test(`${route} fits ${viewport.width}×${viewport.height} and loads its images`, async ({
			page,
		}) => {
			await page.setViewportSize(viewport)
			const response = await page.goto(route, { waitUntil: 'load' })
			expect(response?.status()).toBe(200)
			await expect(page.getByRole('heading', { level: 1 })).toBeVisible()
			await settle(page)

			// Decode below-the-fold images too, not just the ones initially on screen.
			const brokenImages = await page.evaluate(async () => {
				const images = Array.from(document.images)
				return (
					await Promise.all(
						images.map(async (image) => {
							image.loading = 'eager'
							try {
								await image.decode()
								return image.naturalWidth > 0 ? null : image.currentSrc || image.src
							} catch {
								return image.currentSrc || image.src
							}
						}),
					)
				).filter((src) => src !== null)
			})
			expect(brokenImages, 'broken page images').toEqual([])
			const overflow = await page.evaluate(
				() => document.documentElement.scrollWidth - window.innerWidth,
			)
			expect(overflow, 'horizontal page overflow in CSS px').toBeLessThanOrEqual(0)
		})
	}
}
