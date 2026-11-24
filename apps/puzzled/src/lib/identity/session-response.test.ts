import { expect, test } from 'bun:test'
import { expireSessions, issueSession } from './session-response'

test('sign-in preserves the Rust cookie name and sign-out clears both names', () => {
	const response = issueSession(new Response(), 'fixture-new', true)
	const [session, expired] = response.headers.getSetCookie()
	expect(session).toBe('puzzled_session=fixture-new; Path=/; HttpOnly; Secure; SameSite=Lax')
	expect(expired).toStartWith('sylphx_identity_session=; Max-Age=0;')
	const clear = expireSessions(new Response(), true).headers.getSetCookie()
	expect(clear.map((cookie) => cookie.split(';')[0])).toEqual([
		'puzzled_session=',
		'sylphx_identity_session=',
	])
	expect(clear.every((cookie) => cookie.includes('Max-Age=0'))).toBe(true)
})
