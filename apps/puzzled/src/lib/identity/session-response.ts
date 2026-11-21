import { parseCookie, serializeCookie } from 'cookie-es'
import {
	LEGACY_SESSION_COOKIE,
	legacySessionToMigrate,
	SESSION_COOKIE,
	SESSION_COOKIE_NAMES,
	sessionCookieOptions,
} from './session-cookie'

function expiredCookie(name: string, secure: boolean): string {
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
	response.headers.append('set-cookie', expiredCookie(LEGACY_SESSION_COOKIE, secure))
	return response
}

export function expireSessions(response: Response, secure: boolean): Response {
	for (const name of SESSION_COOKIE_NAMES)
		response.headers.append('set-cookie', expiredCookie(name, secure))
	return response
}

/** The read side still accepts the legacy cookie; reissue only if no handler replaced it. */
export function migratedSessionHeaders(
	request: Request,
	responseHeaders: Headers,
	secure: boolean,
) {
	const cookies = parseCookie(request.headers.get('cookie') ?? '')
	const token = legacySessionToMigrate({ get: (name) => ({ value: cookies[name] ?? '' }) })
	if (!token) return []
	if (
		responseHeaders
			.getSetCookie()
			.some((line) => SESSION_COOKIE_NAMES.some((name) => line.startsWith(`${name}=`)))
	) {
		return []
	}
	return issueSession(new Response(null), token, secure).headers.getSetCookie()
}
