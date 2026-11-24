import { afterEach, expect, mock, test } from 'bun:test'
import { OAUTH_ACCEPTANCE, OAUTH_PREFIX } from './oauth-contract'
import { handleOAuth } from './oauth-server'

const authApi = 'https://identity.example.test'
const portal = 'https://auth.tryit.fun'
const origin = 'https://tryit.fun'
const org = 'organization-00000000-0000-4000-8000-000000000123'
const binding = {
	SYLPHX_AUTH_URL: authApi,
	SYLPHX_AUTH_ORGANIZATION_ID: org,
	SYLPHX_PUBLISHABLE_KEY: 'sylphx_pk_test_fixture',
	SYLPHX_AUTH_SECRET_KEY: 'identity_org_key_test_fixture',
} as const
const originalEnv = Object.fromEntries(Object.keys(binding).map((key) => [key, process.env[key]]))
const originalFetch = globalThis.fetch

afterEach(() => {
	globalThis.fetch = originalFetch
	for (const [key, value] of Object.entries(originalEnv)) {
		if (value === undefined) delete process.env[key]
		else process.env[key] = value
	}
})

function start() {
	return handleOAuth(
		new Request(`${origin}${OAUTH_PREFIX}/start/google`, {
			method: 'POST',
			headers: {
				host: 'tryit.fun',
				origin,
				'content-type': 'application/json',
				'user-agent': 'Test Browser',
			},
			body: JSON.stringify({ next: '/archive', acceptance: OAUTH_ACCEPTANCE }),
		}),
	)
}

function upstream(instanceId: string, providerCallback: string) {
	Object.assign(process.env, binding)
	const google = new URL('https://accounts.google.com/o/oauth2/v2/auth')
	google.searchParams.set('redirect_uri', providerCallback)
	const fetcher = mock(async (url: URL, init?: RequestInit) => {
		const headers = new Headers(init?.headers)
		if (url.href === `${authApi}/v1/client/config`) {
			expect(headers.get('authorization')).toBe(`Bearer ${binding.SYLPHX_PUBLISHABLE_KEY}`)
			return Response.json({
				instance: { id: instanceId, slug: 'tryit-fixture', environment: 'test' },
				portal_origin: portal,
				portal_url: portal,
				social: [
					{
						provider: 'google',
						credentials: 'custom',
						start_url: `${portal}/oauth/google/start?instance=tryit-fixture`,
					},
				],
			})
		}
		expect(url.origin + url.pathname).toBe(`${portal}/oauth/google/start`)
		expect(url.searchParams.get('instance')).toBe('tryit-fixture')
		expect(url.searchParams.get('session_mode')).toBe('server')
		const callback = new URL(url.searchParams.get('redirect_url') ?? '')
		expect(callback.origin + callback.pathname).toBe(`${origin}${OAUTH_PREFIX}/callback`)
		expect(callback.searchParams.get('flow')).toMatch(/^[\w-]{43}$/)
		expect(headers.has('authorization')).toBe(false)
		expect(headers.get('user-agent')).toBe('Test Browser')
		return Response.redirect(google, 303)
	})
	globalThis.fetch = fetcher as unknown as typeof fetch
	return fetcher
}

test('white-label portal owns the upstream Google callback; no app credentials reach it', async () => {
	const fetcher = upstream(org, `${portal}/oauth/callback`)
	const response = await start()
	expect(response.status).toBe(200)
	expect((await response.json()).authorize).toContain(
		'https://accounts.google.com/o/oauth2/v2/auth?',
	)
	expect(response.headers.getSetCookie()[0]).toMatch(
		/^__Host-auth_flow=.*Secure; HttpOnly; SameSite=Lax/,
	)
	expect(fetcher).toHaveBeenCalledTimes(2)
})

test('refuses the wrong tenant, a foreign provider callback, and a callback without the flow cookie', async () => {
	const wrongTenant = upstream(
		'organization-00000000-0000-4000-8000-000000000456',
		`${portal}/oauth/callback`,
	)
	expect((await start()).status).toBe(503)
	expect(wrongTenant).toHaveBeenCalledTimes(1)
	const wrongCallback = upstream(org, 'https://foreign.example/oauth/callback')
	const refused = await start()
	expect(refused.status).toBe(503)
	expect(refused.headers.getSetCookie()).toEqual([])
	const callback = await handleOAuth(
		new Request(`${origin}${OAUTH_PREFIX}/callback`, { headers: { host: 'tryit.fun' } }),
	)
	expect(callback.status).toBe(303)
	expect(callback.headers.get('location')).toBe('/sign-in?error=signin&next=%2F')
	expect(
		callback.headers.getSetCookie().every((cookie) => !cookie.startsWith('puzzled_session=')),
	).toBe(true)
	expect(wrongCallback).toHaveBeenCalledTimes(2)
})
