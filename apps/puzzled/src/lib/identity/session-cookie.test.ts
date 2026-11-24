import { expect, test } from 'bun:test'
import { readSessionToken } from './session-cookie'

function token(cookie: string) {
	return readSessionToken(new Request('https://tryit.fun/', { headers: { cookie } }))
}

test('uses the existing app cookie and reads the previous name for returning players', () => {
	expect(token('puzzled_session=new; sylphx_identity_session=old')).toBe('new')
	expect(token('sylphx_identity_session=old')).toBe('old')
	expect(token('')).toBeUndefined()
})

test('does not fall back from a malformed or ambiguous current cookie', () => {
	expect(token('puzzled_session=; sylphx_identity_session=old')).toBeUndefined()
	expect(
		token('puzzled_session=one; puzzled_session=two; sylphx_identity_session=old'),
	).toBeUndefined()
})
