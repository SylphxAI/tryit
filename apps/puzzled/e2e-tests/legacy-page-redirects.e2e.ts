import { type APIRequestContext, expect, test } from '@playwright/test'

const pages = [
	['/games/threads', '/games/word-groups'],
	['/games/paint', '/games/nonogram'],
	['/games/rungs', '/games/word-ladder'],
	['/games/hunt', '/games/word-search'],
	['/games/path', '/games/number-path'],
	['/games/five', '/games/word-guess'],
	['/games/quad', '/games/quad-words'],
	['/games/match', '/games/pattern-match'],
	['/games/spots', '/games/pip-place'],
	['/games/cage-sudoku', '/games/killer-sudoku'],
	['/games/slides', '/games/block-slide'],
	['/games/mini-grid', '/games/crossword'],
	['/games/cipher', '/games/cryptogram'],
	['/games/frame', '/games/word-box'],
	['/games/hive', '/games/word-hive'],
	['/games/spellbee', '/games/word-hive'],
	['/games/mini', '/games/crossword'],
	['/compare', '/vs'],
] as const

async function expectRedirect(request: APIRequestContext, alias: string, target: string) {
	const legacy = await request.get(alias, { maxRedirects: 0 })
	expect(legacy.status(), alias).toBe(301)
	expect(legacy.headers().location, alias).toBe(target)
	const canonical = await request.get(target, { maxRedirects: 0 })
	expect(canonical.status(), target).toBe(200)
}

test('each public alias 301s directly to a working canonical page', async ({ request }) => {
	// A dated game link checks query preservation without requiring today's board API.
	const query = '?date=2026-09-21&utm_source=legacy%20share'
	for (const [alias, target] of pages) {
		await expectRedirect(request, alias + query, target + query)
	}
})

test('both alias families resolve to working pages in all supported locales', async ({
	request,
}) => {
	for (const [prefix, canonical] of [
		['/en-US', ''],
		['/en-GB', '/en-GB'],
		['/zh-hk', '/zh-HK'],
		['/zh-TW', '/zh-TW'],
		['/zh-CN', '/zh-CN'],
		['/ja', '/ja'],
		['/es', '/es'],
		['/pt-BR', '/pt-BR'],
	]) {
		const query = '?date=2026-09-21&next=%2F%2Fexample.invalid'
		await expectRedirect(
			request,
			`${prefix}/games/threads/${query}`,
			`${canonical}/games/word-groups${query}`,
		)
		await expectRedirect(request, `${prefix}/games/spellbee/`, `${canonical}/games/word-hive`)
		await expectRedirect(request, `${prefix}/games/mini/`, `${canonical}/games/crossword`)
		await expectRedirect(request, `${prefix}/compare/`, `${canonical}/vs`)
	}
})

const retiredPages = [
	['/blog', '/'],
	['/blog/archive/old-post', '/'],
	['/apps/celebrity-lookalike', '/games'],
	['/apps/age-progression', '/games'],
	['/apps/art-style-transfer', '/games'],
	['/apps/crush-match', '/games'],
	['/apps/death-prediction', '/games'],
	['/apps/name-fortune', '/games'],
	['/apps/ai-roast', '/games'],
	['/apps/daily-horoscope', '/games'],
	['/en/memes/wrestling-the-fitted-sheet-e14c9562', '/games'],
	['/avatars/old-gallery', '/games'],
	['/en/wallpapers/midnight-veil-217a3259', '/games'],
	['/stickers/tiny-dino-feels-eabb1f9c', '/games'],
	['/zh/apps/name-fortune', '/zh-TW/games'],
	['/zh/blog/old-post', '/zh-TW'],
] as const

const retiredImages = [
	'/opengraph-image',
	'/en/memes/best-welcome-home-ever-4d72427b/opengraph-image?8549f2ec514e79e6',
	'/en/wallpapers/midnight-veil-217a3259/opengraph-image?8549f2ec514e79e6',
	'/en/memes/wrestling-the-fitted-sheet-e14c9562/opengraph-image?8549f2ec514e79e6',
	'/apps/name-fortune/opengraph-image',
	'/en-US/blog/old-post/opengraph-image/',
]
const unknown = [
	'/JHSttzwPkpbCXs3arkX9w==',
	'/wbsS9bF7s60py2/11wjqg==',
	'/WUfymfFvNcv0Y1KGH3ZCQ==',
	'/XCaLVMG2KJhO9BP+sHd1g==',
	'/blogger/not-a-retired-route',
]

test('retired content redirects in one hop without redirecting retired images or random 404s', async ({
	request,
}) => {
	const options = { maxRedirects: 0, headers: { 'User-Agent': 'Googlebot/2.1' } }
	const query = '?utm_source=legacy%20share'
	for (const [source, target] of retiredPages) {
		await expectRedirect(request, source + query, target + query)
		const head = await request.head(source + query, options)
		expect(head.status(), source).toBe(301)
		expect(head.headers().location, source).toBe(target + query)
	}
	for (const path of [...retiredImages, ...unknown]) {
		for (const method of ['get', 'head'] as const) {
			const response = await request[method](path, options)
			expect(response.status(), path).toBe(404)
			expect(response.headers().location, path).toBeUndefined()
		}
	}
	expect((await request.get('/sign-in', options)).status()).toBe(200)
	const og = await request.get('/og?title=Tryit', options)
	expect(og.status()).toBe(200)
	expect(og.headers()['content-type']).toBe('image/png')
})
