import { createConnectTransport } from '@connectrpc/connect-web'
import { resolveServerConnectBaseUrl } from '@/lib/connect/transport'
import { SESSION_COOKIE_NAMES } from '@/lib/identity/session-cookie'
import { mergeServerConnectInit, SERVER_CONNECT_TIMEOUT_MS } from './connect-fetch'

const GUEST_COOKIE = '__Host-puzzled_guest'
const CHECKOUT_CLAIM_COOKIE = 'puzzled_checkout_claim'

function isProgressCookie(name: string): boolean {
	return (
		name === GUEST_COOKIE ||
		SESSION_COOKIE_NAMES.some((session) => session === name) ||
		(name.startsWith('__sylphx_') && name.endsWith('_session'))
	)
}

function cookieParts(value: string | null) {
	return (value ?? '').split(';').flatMap((part) => {
		const pair = part.trim()
		const equals = pair.indexOf('=')
		if (equals < 1) return []
		return [{ name: pair.slice(0, equals), value: pair.slice(equals + 1), pair }]
	})
}

export function hasAccountSessionCookie(headers: Headers): boolean {
	return cookieParts(headers.get('cookie')).some(
		({ name, value }) => name !== GUEST_COOKIE && isProgressCookie(name) && !!value,
	)
}

export function hasProgressCookie(headers: Headers): boolean {
	return cookieParts(headers.get('cookie')).some(
		({ name, value }) => isProgressCookie(name) && !!value,
	)
}

/** Private, request-local transport. Never forwards unrelated cookies or browser headers. */
export function requestConnectTransport(headers = new Headers()) {
	const cookie = cookieParts(headers.get('cookie'))
		.filter(({ name }) => isProgressCookie(name) || name === CHECKOUT_CLAIM_COOKIE)
		.map(({ pair }) => pair)
		.join('; ')
	const userAgent = headers.get('user-agent')
	return createConnectTransport({
		baseUrl: resolveServerConnectBaseUrl(),
		useBinaryFormat: false,
		fetch: ((input: RequestInfo | URL, init?: RequestInit) =>
			fetch(
				input,
				mergeServerConnectInit(init, cookie, SERVER_CONNECT_TIMEOUT_MS, userAgent),
			)) as typeof fetch,
	})
}
