import { describe, expect, test } from 'bun:test'
import { canonicalPageRedirect } from './page-redirect'

const INTERNAL = 'http://web.tryit.svc.cluster.local'

describe('SolidStart locale redirects', () => {
	test.each([
		['/en-US/archive?checkout=cancelled', '/archive?checkout=cancelled', 308],
		['/en-US', '/', 308],
		['/zh-hk/games?source=daily', '/zh-HK/games?source=daily', 307],
		['/EN-us/archive', '/archive', 307],
		['/en-US//archive', '/archive', 308],
	])('normalizes %s without including the internal host', (input, expected, status) => {
		const response = canonicalPageRedirect(new Request(`${INTERNAL}${input}`))
		expect(response?.status).toBe(status)
		expect(response?.headers.get('Location')).toBe(expected)
	})

	test.each(['/archive', '/zh-HK', '/api/health', '/robots.txt', '/zh-HKX/archive'])(
		'does not redirect %s',
		(path) => {
			expect(canonicalPageRedirect(new Request(`${INTERNAL}${path}`))).toBeUndefined()
		},
	)

	test('leaves writes to their owning endpoints', () => {
		const request = new Request(`${INTERNAL}/en-US/archive`, { method: 'POST' })
		expect(canonicalPageRedirect(request)).toBeUndefined()
	})
})
