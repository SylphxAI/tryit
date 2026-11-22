import { describe, expect, test } from 'bun:test'
import {
	LEGACY_SESSION_COOKIE,
	legacySessionToMigrate,
	readSessionToken,
	SESSION_COOKIE,
	SESSION_COOKIE_NAMES,
} from './session-cookie'
import { migratedSessionHeaders } from './session-response'

function jar(values: Record<string, string>) {
	return { get: (name: string) => (name in values ? { value: values[name] as string } : undefined) }
}

function request(cookie: string) {
	return new Request('https://puzzled.gg/games', { headers: { cookie } })
}

describe('session cookie rename', () => {
	test('the new cookie works and wins over the old one', () => {
		expect(readSessionToken(jar({ [SESSION_COOKIE]: 'new' }))).toBe('new')
		expect(readSessionToken(jar({ [SESSION_COOKIE]: 'new', [LEGACY_SESSION_COOKIE]: 'old' }))).toBe(
			'new',
		)
		expect(legacySessionToMigrate(jar({ [SESSION_COOKIE]: 'new' }))).toBeUndefined()
		expect(
			legacySessionToMigrate(jar({ [SESSION_COOKIE]: 'new', [LEGACY_SESSION_COOKIE]: 'old' })),
		).toBeUndefined()
	})

	test('an old-cookie request stays signed in', () => {
		expect(readSessionToken(jar({ [LEGACY_SESSION_COOKIE]: 'old' }))).toBe('old')
		expect(legacySessionToMigrate(jar({ [LEGACY_SESSION_COOKIE]: 'old' }))).toBe('old')
		expect(readSessionToken(jar({}))).toBeUndefined()
	})

	test('the proxy re-sets an old cookie under the new name and expires the old one', () => {
		const cookies = migratedSessionHeaders(
			request(`${LEGACY_SESSION_COOKIE}=old-token`),
			new Headers(),
			true,
		)
		expect(cookies[0]).toStartWith(`${SESSION_COOKIE}=old-token;`)
		expect(cookies[1]).toStartWith(`${LEGACY_SESSION_COOKIE}=;`)
		expect(cookies[1]).toContain('Max-Age=0')
	})

	test('sign-out clears both names', () => {
		expect([...SESSION_COOKIE_NAMES]).toEqual([SESSION_COOKIE, LEGACY_SESSION_COOKIE])
	})

	test('the proxy leaves a new-cookie request alone', () => {
		expect(
			migratedSessionHeaders(request(`${SESSION_COOKIE}=new-token`), new Headers(), true),
		).toEqual([])
	})
})
