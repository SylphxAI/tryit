import { afterEach, describe, expect, mock, test } from 'bun:test'
import { authConfig, googleStartUrl, isNewUser, safeNext, sessionTimes } from './client-auth'
import { POLICY_ACCEPTANCE } from './policy-consent'

const instanceId = '0199aa10-7b2c-7d3e-8f00-00000000c0de'
const env = {
	SYLPHX_AUTH_ORGANIZATION_ID: `organization-${instanceId}`,
	SYLPHX_AUTH_URL: 'https://auth.example/',
	SYLPHX_PUBLISHABLE_KEY: 'sylphx_pk_test_1',
	SYLPHX_AUTH_SECRET_KEY: 'identity_org_key_1',
}

describe('Sylphx Auth client', () => {
	test('config needs both keys and honors the bound Auth origin', () => {
		expect(authConfig(env)).toEqual({
			url: 'https://auth.example',
			publishableKey: 'sylphx_pk_test_1',
			secretKey: 'identity_org_key_1',
			instanceId: `organization-${instanceId}`,
		})
		expect(authConfig({ SYLPHX_PUBLISHABLE_KEY: 'pk' })).toBeNull()
		expect(authConfig({ SYLPHX_PUBLISHABLE_KEY: 'pk', SYLPHX_AUTH_SECRET_KEY: 'sk' })?.url).toBe(
			'https://api.identity.sylphx.com',
		)
	})

	test("Auth's new-user flag wins; otherwise a just-created account is new", () => {
		expect(
			isNewUser({ flag: false, principalCreatedAt: 100, sessionCreatedAt: 100, now: 100 }),
		).toBe(false)
		expect(isNewUser({ flag: true, now: 0 })).toBe(true)
		expect(isNewUser({ principalCreatedAt: 1000, sessionCreatedAt: 1030, now: 2000 })).toBe(true)
		expect(isNewUser({ principalCreatedAt: 1000, sessionCreatedAt: 1000 + 601, now: 0 })).toBe(
			false,
		)
		expect(isNewUser({ now: 1000 })).toBe(false)
	})

	describe('Google OAuth start', () => {
		const originalFetch = globalThis.fetch
		afterEach(() => {
			globalThis.fetch = originalFetch
		})
		const config = {
			url: 'https://api.identity.sylphx.com',
			publishableKey: 'pk',
			secretKey: 'sk',
			instanceId: `organization-${instanceId}`,
		}
		const portal = 'https://auth.tryit.fun'
		const sharedPath = '/v1/client/oauth/google/start'
		const callback = 'https://tryit.fun/api/identity/oauth/callback?next=%2Fgames'
		const hostedStart = `${portal}/oauth/google/start?instance=tryit-test`
		const shared = {
			provider: 'google',
			credentials: 'shared',
			start_url: `https://api.sylphx.com${sharedPath}`,
		}
		const hosted = { provider: 'google', credentials: 'custom', start_url: hostedStart }
		const active = { portal_origin_mode: 'hosted', portal_url: portal, social: [hosted] }
		const google = 'https://accounts.google.com/o/oauth2/v2/auth?state=provider-state'

		function stub(settings: Record<string, unknown>, location = google, status = 303) {
			const fetcher = mock(async (input: string, init?: RequestInit) => {
				const target = new URL(input)
				expect(target.origin).toBe(config.url)
				expect(new Headers(init?.headers).get('authorization')).toBe('Bearer pk')
				expect(new Headers(init?.headers).get('user-agent')).toBe('Test Browser')
				expect(init?.cache).toBe('no-store')
				if (target.pathname === '/v1/client/config') {
					expect(init?.method).toBe('GET')
					return Response.json({ instance: { id: instanceId, slug: 'tryit-test' }, ...settings })
				}
				expect(target.pathname).toBe(sharedPath)
				expect(init?.redirect).toBe('manual')
				expect(target.searchParams.get('redirect_url')).toBe(callback)
				expect(target.searchParams.get('session_mode')).toBe('server')
				expect(target.searchParams.has('publishable_key')).toBe(false)
				return new Response(null, { status, headers: { location } })
			})
			globalThis.fetch = fetcher as unknown as typeof fetch
			return fetcher
		}

		test('uses the exact hosted URL and preserves policy acceptance without exposing keys', async () => {
			const fetcher = stub(active)
			const url = new URL(await googleStartUrl(config, callback, 'Test Browser', POLICY_ACCEPTANCE))
			expect(url.origin + url.pathname).toBe(`${portal}/oauth/google/start`)
			expect(Object.fromEntries(url.searchParams)).toEqual({
				instance: 'tryit-test',
				redirect_url: callback,
				session_mode: 'server',
				terms_accepted: 'true',
				terms_version: POLICY_ACCEPTANCE.terms_version,
				privacy_version: POLICY_ACCEPTANCE.privacy_version,
				surface: 'puzzled_web',
			})
			expect(fetcher).toHaveBeenCalledTimes(1)
		})

		test('keeps shared Google working with or without a hosted portal already verified', async () => {
			for (const settings of [
				{
					portal_origin_mode: null,
					portal_url: 'https://tryit-test.auth.sylphx.net',
					social: [shared],
				},
				{ ...active, social: [shared] },
				{ social: [{ provider: 'google' }] },
			]) {
				const fetcher = stub(settings)
				expect(await googleStartUrl(config, callback, 'Test Browser', POLICY_ACCEPTANCE)).toBe(
					google,
				)
				const [, start] = fetcher.mock.calls
				expect(new URL(start?.[0] ?? '').searchParams.get('terms_accepted')).toBe('true')
				expect(fetcher).toHaveBeenCalledTimes(2)
			}
		})

		test('handles activation between settings and the shared API start', async () => {
			const raced = new URL(hostedStart)
			raced.searchParams.set('redirect_url', callback)
			raced.searchParams.set('session_mode', 'server')
			stub({ social: [shared] }, raced.href)
			const result = new URL(
				await googleStartUrl(config, callback, 'Test Browser', POLICY_ACCEPTANCE),
			)
			expect(result.origin).toBe(portal)
			expect(result.searchParams.get('terms_accepted')).toBe('true')
		})

		test('refuses unsafe or inconsistent settings without falling back', async () => {
			for (const settings of [
				{ ...active, portal_url: 'https://foreign.test' },
				{ ...active, portal_origin_mode: 'third_party' },
				{
					...active,
					social: [
						{ ...hosted, start_url: 'https://foreign.test/oauth/google/start?instance=tryit-test' },
					],
				},
				{
					...active,
					social: [{ ...hosted, start_url: `${hostedStart}&redirect_url=https://foreign.test` }],
				},
				{ ...active, social: [{ ...shared, start_url: 'https://foreign.test' }] },
				{ ...active, instance: { id: 'deaddead-dead-dead-dead-deaddeaddead', slug: 'tryit-test' } },
				{ ...active, instance: { id: instanceId, slug: '-invalid' } },
				{ ...active, social: [] },
			]) {
				const fetcher = stub(settings)
				await expect(googleStartUrl(config, callback, 'Test Browser')).rejects.toThrow()
				expect(fetcher).toHaveBeenCalledTimes(1)
			}
		})

		test('does not pass through an unexpected redirect from the shared API', async () => {
			for (const [target, status] of [
				['https://accounts.google.com.foreign.test', 303],
				[`${hostedStart}&redirect_url=https://foreign.test`, 303],
				['/relative', 303],
				[google, 302],
			] as const) {
				stub({ social: [shared] }, target, status)
				await expect(googleStartUrl(config, callback, 'Test Browser')).rejects.toThrow(
					'oidc_begin_failed',
				)
			}
		})
	})

	test('the return path never leaves the site', () => {
		expect(safeNext('/games/sudoku?x=1')).toBe('/games/sudoku?x=1')
		for (const bad of ['https://evil.example', '//evil.example', '/\\evil', '', null, '/a\nb']) {
			expect(safeNext(bad)).toBe('/')
		}
	})

	describe('sessionTimes', () => {
		const originalFetch = globalThis.fetch
		afterEach(() => {
			globalThis.fetch = originalFetch
		})
		const own = 'organization-0199aa10-7b2c-7d3e-8f00-00000000c0de'
		const answer = (project?: string) => {
			globalThis.fetch = (async (_url: string, init?: RequestInit) =>
				// The fake Auth requires the product's own caller key.
				(init?.headers as Record<string, string>)?.['x-sylphx-caller-key'] !== 'pk'
					? new Response('{}', { status: 401 })
					: new Response(
							JSON.stringify({
								session: {
									created_at_unix_seconds: '1030',
									principal: { created_at_unix_seconds: 1000, project_id: project },
								},
							}),
						)) as unknown as typeof fetch
		}
		const config = { url: 'https://auth.example', publishableKey: 'pk', secretKey: 'sk' }

		test("reads the times of a session of this product's own Auth instance", async () => {
			answer(own)
			expect(await sessionTimes(config, 't', 'ua', own)).toEqual({
				principalCreatedAt: 1000,
				sessionCreatedAt: 1030,
			})
		})

		test('reads nothing from another instance, no instance, or with ours unset', async () => {
			answer('organization-0199aa10-7b2c-7d3e-8f00-00000000bad0')
			expect(await sessionTimes(config, 't', 'ua', own)).toEqual({})
			answer(undefined)
			expect(await sessionTimes(config, 't', 'ua', own)).toEqual({})
			answer(own)
			expect(await sessionTimes(config, 't', 'ua', undefined)).toEqual({})
		})
	})
})
