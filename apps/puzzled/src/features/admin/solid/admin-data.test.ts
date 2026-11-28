import { afterEach, beforeEach, expect, test } from 'bun:test'
import { readAdminDocument } from './admin-data'

const originalFetch = globalThis.fetch
const originalBase = process.env.API_INTERNAL_URL
const originalCaller = process.env.SYLPHX_PUBLISHABLE_KEY
const calls: Request[] = []
let response: Response

beforeEach(() => {
	calls.length = 0
	process.env.API_INTERNAL_URL = 'http://api.test'
	// A separate web-side Auth lookup must be observable as an extra fetch.
	process.env.SYLPHX_PUBLISHABLE_KEY = 'fixture-publishable-key'
	globalThis.fetch = (async (input, init) => {
		calls.push(new Request(input, init))
		return response.clone()
	}) as typeof fetch
})

afterEach(() => {
	globalThis.fetch = originalFetch
	if (originalBase === undefined) delete process.env.API_INTERNAL_URL
	else process.env.API_INTERNAL_URL = originalBase
	if (originalCaller === undefined) delete process.env.SYLPHX_PUBLISHABLE_KEY
	else process.env.SYLPHX_PUBLISHABLE_KEY = originalCaller
})

const load = (cookie = 'puzzled_session=fixture-session') =>
	readAdminDocument(
		new Request('https://tryit.fun/admin/analytics', {
			headers: { cookie, 'user-agent': 'Fixture browser', 'tryit-analytics-access': 'admin' },
		}),
		'analytics',
		'',
		new URLSearchParams(),
	)

function expectOnlyMetrics() {
	expect(calls.map((request) => request.url)).toEqual([
		'http://api.test/puzzled.v1.AdminService/GetMetricsReport',
	])
	expect(calls[0]?.headers.get('cookie')).toBe('puzzled_session=fixture-session')
	expect(calls[0]?.headers.get('user-agent')).toBe('Fixture browser')
	expect(calls[0]?.headers.get('tryit-analytics-access')).toBeNull()
}

for (const [access, analyticsOnly] of [
	['admin', false],
	['reader', true],
	[null, false],
	['unknown', true],
] as const) {
	test(`successful report controls analytics navigation: ${access}`, async () => {
		response = Response.json(
			{ stale: true },
			{ headers: access === null ? {} : { 'tryit-analytics-access': access } },
		)
		expect(await load()).toMatchObject({
			kind: 'analytics',
			analyticsOnly,
			report: { stale: true },
		})
		expectOnlyMetrics()
	})
}

for (const [code, status, kind] of [
	['permission_denied', 403, 'denied'],
	['unauthenticated', 401, 'guest'],
	['unavailable', 503, 'unavailable'],
] as const) {
	test(`report error maps to the existing page state: ${code}`, async () => {
		response = Response.json({ code, message: 'internal detail' }, { status })
		expect(await load()).toEqual({ kind })
		expectOnlyMetrics()
	})
}

test('a guest cookie does not call Auth or the report API', async () => {
	expect(await load('__Host-puzzled_guest=fixture-guest')).toEqual({ kind: 'guest' })
	expect(calls).toHaveLength(0)
})
