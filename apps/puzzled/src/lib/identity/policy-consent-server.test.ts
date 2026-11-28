import { afterEach, beforeEach, expect, mock, test } from 'bun:test'
import { POLICY_ACCEPTANCE } from './policy-consent'
import { recordPolicyAcceptance } from './policy-consent-server'

const origin = 'https://identity.example.test'
const projectId = 'organization-00000000-0000-4000-8000-000000000123'
const principalId = 'fixture-user'
const credential = 'fixture-auth-credential'
const binding = {
	SYLPHX_AUTH_URL: origin,
	SYLPHX_AUTH_ORGANIZATION_ID: projectId,
	SYLPHX_AUTH_SECRET_KEY: credential,
}
const originalEnv = Object.fromEntries(Object.keys(binding).map((key) => [key, process.env[key]]))
const originalFetch = globalThis.fetch

beforeEach(() => Object.assign(process.env, binding))
afterEach(() => {
	globalThis.fetch = originalFetch
	for (const [key, value] of Object.entries(originalEnv)) {
		if (value === undefined) delete process.env[key]
		else process.env[key] = value
	}
})

function captureFetch(respond: () => Response) {
	const fetcher = mock(async (_url: string, _init?: RequestInit) => respond())
	globalThis.fetch = fetcher as unknown as typeof fetch
	return fetcher
}

test('records only the seven-field consent fact at the organization-authenticated ledger', async () => {
	const fetcher = captureFetch(() => Response.json({ consent: {} }, { status: 201 }))
	const before = Math.floor(Date.now() / 1000)
	await recordPolicyAcceptance(principalId, POLICY_ACCEPTANCE)
	const after = Math.floor(Date.now() / 1000)
	expect(fetcher).toHaveBeenCalledTimes(1)
	const [url, init] = fetcher.mock.calls[0]!
	expect(url).toBe(`${origin}/v1/consents`)
	expect(init?.method).toBe('POST')
	expect(new Headers(init?.headers).get('authorization')).toBe(`Bearer ${credential}`)
	expect(init?.signal).toBeInstanceOf(AbortSignal)
	const fact = JSON.parse(String(init?.body))
	expect(Object.keys(fact)).toHaveLength(7)
	expect(fact).toEqual({
		idempotency_key: expect.stringMatching(
			/^[\da-f]{8}-[\da-f]{4}-7[\da-f]{3}-[89ab][\da-f]{3}-[\da-f]{12}$/,
		),
		project_id: projectId,
		principal_id: principalId,
		purpose: 'policy_acceptance:terms=2026-11-14;privacy=2026-11-27;surface=puzzled_web',
		state: 'granted',
		legal_basis: 'consent',
		occurred_at_unix_seconds: expect.any(Number),
	})
	expect(Number.isInteger(fact.occurred_at_unix_seconds)).toBe(true)
	expect(fact.occurred_at_unix_seconds).toBeGreaterThanOrEqual(before)
	expect(fact.occurred_at_unix_seconds).toBeLessThanOrEqual(after)
})

test('propagates ledger refusal without retrying or falling back', async () => {
	const fetcher = captureFetch(() => Response.json({ code: 'forbidden' }, { status: 403 }))
	await expect(recordPolicyAcceptance(principalId, POLICY_ACCEPTANCE)).rejects.toMatchObject({
		status: 403,
	})
	expect(fetcher.mock.calls.map(([url]) => url)).toEqual([`${origin}/v1/consents`])
})

test('propagates a timed out ledger write', async () => {
	const error = new DOMException('timed out', 'TimeoutError')
	captureFetch(() => {
		throw error
	})
	await expect(recordPolicyAcceptance(principalId, POLICY_ACCEPTANCE)).rejects.toBe(error)
})

for (const [key, error] of [
	['SYLPHX_AUTH_SECRET_KEY', 'identity_credential_unconfigured'],
	['SYLPHX_AUTH_ORGANIZATION_ID', 'identity_project_unconfigured'],
] as const) {
	test(`does not contact Auth without ${key}`, async () => {
		const fetcher = captureFetch(() => Response.json({}, { status: 201 }))
		delete process.env[key]
		await expect(recordPolicyAcceptance(principalId, POLICY_ACCEPTANCE)).rejects.toThrow(error)
		expect(fetcher).not.toHaveBeenCalled()
	})
}
