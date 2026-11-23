import { describe, expect, test } from 'bun:test'
import { legacyPageRedirect } from './legacy-page-redirect'

const origin = 'http://web.example.internal'

describe('legacy public page redirects', () => {
	test.each([
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
	])('permanently redirects %s to %s', (path, target) => {
		const response = legacyPageRedirect(new Request(origin + path))
		expect(response?.status).toBe(301)
		expect(response?.headers.get('location')).toBe(target)
	})

	test.each([
		['/en-US', ''],
		['/en-GB', '/en-GB'],
		['/zh-hk', '/zh-HK'],
		['/zh-TW', '/zh-TW'],
		['/zh-CN', '/zh-CN'],
		['/ja', '/ja'],
		['/es', '/es'],
		['/pt-br', '/pt-BR'],
	])('canonicalizes %s and removes trailing slashes for both route families', (prefix, target) => {
		for (const [path, canonical] of [
			['/games/threads/', '/games/word-groups'],
			['/compare/', '/vs'],
		]) {
			const response = legacyPageRedirect(new Request(origin + prefix + path, { method: 'HEAD' }))
			expect(response?.status).toBe(301)
			expect(response?.headers.get('location')).toBe(target + canonical)
		}
	})

	test('keeps the encoded query without using it, the host, or a cookie to select the destination', () => {
		const query = '?date=2026-09-21&utm_source=a%20b&utm_source=share&next=%2F%2Fexample.invalid'
		const response = legacyPageRedirect(
			new Request(`${origin}/games/hive${query}`, {
				headers: { cookie: 'NEXT_LOCALE=es', 'x-forwarded-host': 'example.invalid' },
			}),
		)
		expect(response?.headers.get('location')).toBe(`/games/word-hive${query}`)
	})

	test.each([
		'/games/word-groups',
		'/games/constructor',
		'/games/unknown',
		'/games/threadsville',
		'/games/threads/play',
		'/games/%2Fthreads',
		'/vs',
		'/compare/wordle',
		'/de/compare',
		'/api/games/threads',
		'//example.invalid/compare',
		'/en-US//compare',
	])('leaves %s unchanged', (path) => {
		expect(legacyPageRedirect(new Request(origin + path))).toBeUndefined()
	})

	test('leaves writes to their owning endpoints', () => {
		expect(legacyPageRedirect(new Request(`${origin}/compare`, { method: 'POST' }))).toBeUndefined()
	})
})
