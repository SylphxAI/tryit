import { serializeCookie } from 'cookie-es'
import {
	LEGACY_SESSION_COOKIE,
	SESSION_COOKIE,
	SESSION_COOKIE_NAMES,
	sessionCookieOptions,
} from './session-cookie'

export function expiredSessionCookie(name: string, secure: boolean): string {
	return serializeCookie(name, '', {
		...sessionCookieOptions(secure),
		maxAge: 0,
		expires: new Date(0),
	})
}

/** Build both headers before modifying the response; a failed write is not a sign-in. */
export function issueSession(response: Response, token: string, secure: boolean): Response {
	const session = serializeCookie(SESSION_COOKIE, token, sessionCookieOptions(secure))
	response.headers.append('set-cookie', session)
	response.headers.append('set-cookie', expiredSessionCookie(LEGACY_SESSION_COOKIE, secure))
	return response
}

export function expireSessions(response: Response, secure: boolean): Response {
	for (const name of SESSION_COOKIE_NAMES)
		response.headers.append('set-cookie', expiredSessionCookie(name, secure))
	return response
}
