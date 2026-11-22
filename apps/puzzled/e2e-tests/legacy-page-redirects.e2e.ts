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
