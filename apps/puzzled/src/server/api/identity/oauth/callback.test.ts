import { afterEach, beforeEach, describe, expect, mock, test } from 'bun:test'
import { SESSION_COOKIE } from '@/lib/identity/session-cookie'
import { GET } from './callback'

// Keep the real ticket exchange and cookie path; attribution is a separate API.
mock.module('@/lib/identity/signup-attribution', () => ({
	recordSignupAttribution: async () => {},
}))

const app = 'https://tryit.fun'
const auth = 'https://api.identity.sylphx.com'
const env = {
	SYLPHX_AUTH_URL: auth,
	SYLPHX_PUBLISHABLE_KEY: 'fixture-pk',
	SYLPHX_AUTH_SECRET_KEY: 'fixture-sk',
}
const original = Object.fromEntries(Object.keys(env).map((key) => [key, process.env[key]]))
const originalFetch = globalThis.fetch
const fixtureTicket = 'a'.repeat(43)
const fixtureToken = 'fixture-session-value'
beforeEach(() => Object.assign(process.env, env))
afterEach(() => {
	globalThis.fetch = originalFetch
	for (const [key, value] of Object.entries(original)) {
		if (value === undefined) delete process.env[key]
		else process.env[key] = value
	}
})

function request(query: string) {
	return new Request(`${app}/api/identity/oauth/callback?${query}`, {
		headers: { 'user-agent': 'Test Browser' },
	})
}

function stub(status = 200) {
	const fetcher = mock(async (input: string, init?: RequestInit) => {
		expect(input).toBe(`${auth}/v1/client/tickets:redeem`)
		expect(init?.method).toBe('POST')
		expect(new Headers(init?.headers).get('authorization')).toBe('Bearer fixture-sk')
		expect(new Headers(init?.headers).get('user-agent')).toBe('Test Browser')
		expect(JSON.parse(String(init?.body))).toEqual({ ticket: fixtureTicket })
		return status === 200
			? Response.json({ session: { token: fixtureToken }, is_new_user: true })
			: Response.json({ code: 'unauthorized' }, { status })
	})
	globalThis.fetch = fetcher as unknown as typeof fetch
	return fetcher
}

describe('Google OAuth callback', () => {
	for (const aliases of [
		['auth_ticket'],
		['sylphx_ticket'],
		['ticket'],
		['auth_ticket', 'sylphx_ticket'],
	]) {
		test(`redeems exactly once with ${aliases.join(' and ')}`, async () => {
			const fetcher = stub()
			const query = new URLSearchParams([
				['next', '/games'],
				...aliases.map((alias) => [alias, fixtureTicket]),
			])
			const response = await GET(request(query.toString()))
			expect(response.status).toBe(303)
			expect(response.headers.get('location')).toBe('/games')
			expect(response.headers.get('cache-control')).toBe('no-store')
			const cookies = response.headers.getSetCookie()
			expect(
				cookies.some(
					(cookie) =>
						cookie.startsWith(`${SESSION_COOKIE}=${fixtureToken};`) && cookie.includes('HttpOnly'),
				),
			).toBe(true)
			expect(cookies.some((cookie) => cookie.includes('oauth'))).toBe(true)
			expect(fetcher).toHaveBeenCalledTimes(1)
		})
	}

	test('refuses missing, duplicate, conflicting, and error-bearing tickets', async () => {
		const fetcher = stub()
		for (const query of [
			'',
			'state=not-a-ticket',
			'ticket=',
			'auth_ticket=a&auth_ticket=a',
			'auth_ticket=a&sylphx_ticket=b',
			'ticket=a&sylphx_ticket=b',
			'ticket=a&auth_error=denied',
			'sylphx_ticket=a&sylphx_error=denied',
		]) {
			const response = await GET(request(query))
			expect(response.status).toBe(303)
			expect(response.headers.get('location')).toBe('/sign-in?error=oauth_failed')
			expect(response.headers.getSetCookie()).toEqual([])
		}
		expect(fetcher).not.toHaveBeenCalled()
	})

	test('an Auth refusal cannot set a cookie or redirect off-site', async () => {
		const fetcher = stub(401)
		const response = await GET(request(`ticket=${fixtureTicket}&next=https://foreign.test`))
		expect(response.headers.get('location')).toBe('/sign-in?error=oauth_failed')
		expect(response.headers.getSetCookie()).toEqual([])
		expect(fetcher).toHaveBeenCalledTimes(1)
	})
})
