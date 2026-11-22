import { describe, expect, test } from 'bun:test'
import { canonicalPageRedirect, preferredPageRedirect } from './page-redirect'

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

describe('remembered page language', () => {
	const headers = { cookie: 'NEXT_LOCALE=es' }
	test('localizes an unprefixed page with its query and never publicly caches the redirect', () => {
		const response = preferredPageRedirect(
			new Request(`${INTERNAL}/settings/preferences?from=profile`, { headers }),
		)
		expect(response?.status).toBe(307)
		expect(response?.headers.get('location')).toBe('/es/settings/preferences?from=profile')
		expect(response?.headers.get('cache-control')).toBe('private, no-store')
	})
	test.each([
		'/ja/settings/preferences',
		'/sign-in',
		'/api/identity/session',
		'/_server/fixture',
		'/sitemap.xml',
		'/crowns',
	])('does not redirect %s', (path) => {
		expect(preferredPageRedirect(new Request(`${INTERNAL}${path}`, { headers }))).toBeUndefined()
	})
	test('ignores invalid or default cookies and does not redirect mutations', () => {
		for (const cookie of ['NEXT_LOCALE=//example.org', 'NEXT_LOCALE=en-US']) {
			expect(
				preferredPageRedirect(
					new Request(`${INTERNAL}/settings/preferences`, { headers: { cookie } }),
				),
			).toBeUndefined()
		}
		expect(
			preferredPageRedirect(
				new Request(`${INTERNAL}/settings/preferences`, { method: 'POST', headers }),
			),
		).toBeUndefined()
	})
})
