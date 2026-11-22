import { describe, expect, test } from 'bun:test'
import { expireSessions, issueSession, migratedSessionHeaders } from './session-response'

const legacy = new Request('https://tryit.fun/', {
	headers: { cookie: 'sylphx_identity_session=fixture-old' },
})

describe('session response cookies', () => {
	test('reissues the legacy token and expires the old name using two headers', () => {
		const [session, expired] = migratedSessionHeaders(legacy, new Headers(), true)
		expect(session).toBe('puzzled_session=fixture-old; Path=/; HttpOnly; Secure; SameSite=Lax')
		expect(expired).toStartWith('sylphx_identity_session=; Max-Age=0;')
	})

	test('does not overwrite a current cookie or append a cookie after sign-in or sign-out', () => {
		const current = new Request(legacy, {
			headers: { cookie: 'puzzled_session=fixture-current; sylphx_identity_session=fixture-old' },
		})
		expect(migratedSessionHeaders(current, new Headers(), true)).toEqual([])
		const issued = issueSession(new Response(), 'fixture-new', true).headers
		expect(issued.getSetCookie()[0]).toStartWith('puzzled_session=fixture-new;')
		expect(migratedSessionHeaders(legacy, issued, true)).toEqual([])
		const expired = expireSessions(new Response(), true).headers
		expect(expired.getSetCookie()).toHaveLength(2)
		expect(expired.getSetCookie().every((cookie) => cookie.includes('Max-Age=0'))).toBe(true)
		expect(migratedSessionHeaders(legacy, expired, true)).toEqual([])
	})
})
