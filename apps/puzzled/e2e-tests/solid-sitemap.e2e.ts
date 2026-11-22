import { expect, test } from '@playwright/test'

// Exercise Solid's HTTP route, not only the XML generator.
test('Solid sitemap serves cacheable XML with archive and game URLs', async ({ page, request }) => {
	test.skip(process.env.SOLID_FIXTURE !== '1', 'run against the Solid production build')
	const response = await request.get('/sitemap.xml', {
		headers: { cookie: 'sylphx_identity_session=ignored-fixture' },
	})
	expect(response.status()).toBe(200)
	expect(response.headers()['content-type']).toBe('application/xml; charset=utf-8')
	expect(response.headers()['cache-control']).toBe('public, max-age=3600')
	expect(response.headers()['set-cookie']).toBeUndefined()
	const urls = await page.evaluate(
		(xml) => {
			const doc = new DOMParser().parseFromString(xml, 'application/xml')
			if (doc.querySelector('parsererror') || doc.documentElement.localName !== 'urlset') return []
			return Array.from(
				doc.querySelectorAll('loc'),
				({ textContent }) => new URL(textContent!).pathname,
			)
		},
		await response.text(),
	)
	expect(urls).toEqual(
		expect.arrayContaining(['/archive', '/zh-HK/archive', '/games/sudoku', '/games/word-guess']),
	)
	expect(urls).not.toContain('/sign-in')
})
