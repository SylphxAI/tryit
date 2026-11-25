import { readAuthSessionCookie } from '@sylphx/auth'

export const SESSION_COOKIE = 'puzzled_session'
export const LEGACY_SESSION_COOKIE = 'sylphx_identity_session'

/** Every name sign-out must clear. */
export const SESSION_COOKIE_NAMES = [SESSION_COOKIE, LEGACY_SESSION_COOKIE] as const

export type SessionCookieOptions = {
	httpOnly: true
	sameSite: 'lax'
	path: '/'
	secure: boolean
}

export function sessionCookieOptions(secure: boolean): SessionCookieOptions {
	return { httpOnly: true, sameSite: 'lax', path: '/', secure }
}

/** Auth validates this credential candidate before opening an account session. */
export function readSessionToken(request: Request): string | undefined {
	return readAuthSessionCookie(request, {
		sessionCookie: SESSION_COOKIE,
		legacyCookies: SESSION_COOKIE_NAMES.slice(1),
	})?.value
}
