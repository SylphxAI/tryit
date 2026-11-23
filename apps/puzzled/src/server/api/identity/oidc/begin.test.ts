import { afterEach, beforeEach, describe, expect, mock, test } from 'bun:test'
import { POLICY_ACCEPTANCE } from '@/lib/identity/policy-consent'
import { POST } from './begin'

const app = 'https://tryit.fun'
const auth = 'https://api.identity.sylphx.com'
const portal = 'https://auth.tryit.fun'
const instance = { id: '0199aa10-7b2c-7d3e-8f00-00000000c0de', slug: 'tryit-test' }
const hosted = {
	provider: 'google',
	credentials: 'custom',
	start_url: `${portal}/oauth/google/start?instance=tryit-test`,
}
const env = {
	SYLPHX_AUTH_URL: auth,
	SYLPHX_AUTH_ORGANIZATION_ID: `organization-${instance.id}`,
	SYLPHX_PUBLISHABLE_KEY: 'fixture-pk',
	SYLPHX_AUTH_SECRET_KEY: 'fixture-sk',
}
const original = Object.fromEntries(Object.keys(env).map((key) => [key, process.env[key]]))
const originalFetch = globalThis.fetch
beforeEach(() => Object.assign(process.env, env))
afterEach(() => {
	globalThis.fetch = originalFetch
	for (const [key, value] of Object.entries(original)) {
		if (value === undefined) delete process.env[key]
		else process.env[key] = value
	}
})

function request(body: object, headers: Record<string, string> = {}) {
	return new Request(`${app}/api/identity/oidc/begin`, {
		method: 'POST',
		headers: {
			host: 'tryit.fun',
			origin: app,
			'content-type': 'application/json',
			'user-agent': 'Test Browser',
			...headers,
		},
		body: JSON.stringify(body),
	})
}

describe('Google OAuth begin', () => {
	test('returns the tenant start with the bounded callback and consent', async () => {
		const fetcher = mock(async (input: string, init?: RequestInit) => {
			expect(input).toBe(`${auth}/v1/client/config`)
			expect(new Headers(init?.headers).get('user-agent')).toBe('Test Browser')
			return Response.json({
				instance,
				portal_origin_mode: 'hosted',
				portal_url: portal,
				social: [hosted],
			})
		})
		globalThis.fetch = fetcher as unknown as typeof fetch
		const response = await POST(
			request({
				provider: 'google',
				redirectUrl: 'https://foreign.test',
				acceptance: POLICY_ACCEPTANCE,
			}),
		)
		expect(response.status).toBe(200)
		expect(response.headers.get('cache-control')).toBe('no-store')
		const target = new URL((await response.json()).authorizationUrl)
		expect(target.origin + target.pathname).toBe(`${portal}/oauth/google/start`)
		expect(target.searchParams.get('redirect_url')).toBe(
			`${app}/api/identity/oauth/callback?next=%2F`,
		)
		expect(target.searchParams.get('terms_version')).toBe(POLICY_ACCEPTANCE.terms_version)
		expect(fetcher).toHaveBeenCalledTimes(1)
	})

	test('still returns a Google authorization URL for the shared client', async () => {
		const google = 'https://accounts.google.com/o/oauth2/v2/auth?state=provider-state'
		const fetcher = mock(async (input: string) =>
			new URL(input).pathname === '/v1/client/config'
				? Response.json({ instance, social: [{ provider: 'google', credentials: 'shared' }] })
				: new Response(null, { status: 303, headers: { location: google } }),
		)
		globalThis.fetch = fetcher as unknown as typeof fetch
		const response = await POST(request({ federationId: 'google', redirectUrl: '/games' }))
		expect(response.status).toBe(200)
		expect(await response.json()).toEqual({ authorizationUrl: google })
		expect(fetcher).toHaveBeenCalledTimes(2)
	})

	test('returns no authorization URL for a foreign start', async () => {
		const fetcher = mock(async () =>
			Response.json({
				instance,
				portal_origin_mode: 'hosted',
				portal_url: portal,
				social: [
					{ ...hosted, start_url: 'https://foreign.test/oauth/google/start?instance=tryit-test' },
				],
			}),
		)
		globalThis.fetch = fetcher as unknown as typeof fetch
		const response = await POST(request({ provider: 'google' }))
		expect(response.status).toBe(502)
		expect(await response.json()).toEqual({ error: 'oidc_begin_failed' })
		expect(fetcher).toHaveBeenCalledTimes(1)
	})

	test('refuses a cross-site or invalid consent request before calling Auth', async () => {
		const fetcher = mock(async () => new Response(null, { status: 500 }))
		globalThis.fetch = fetcher as unknown as typeof fetch
		expect(
			(
				await POST(
					request(
						{ provider: 'google' },
						{ 'sec-fetch-site': 'cross-site', origin: 'https://foreign.test' },
					),
				)
			).status,
		).toBe(403)
		const invalid = await POST(
			request({ provider: 'google', acceptance: { terms_accepted: false } }),
		)
		expect(invalid.status).toBe(400)
		expect(await invalid.json()).toEqual({ error: 'policy_acceptance_required' })
		expect(fetcher).not.toHaveBeenCalled()
	})
})
