import { afterEach, describe, expect, test } from 'bun:test'
import { authConfig, isNewUser, sessionTimes } from './client-auth'

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
