import { safeCallbackPath } from '@/lib/identity/after-sign-up'

export const subscriptionPath = '/settings/subscription'
const checkoutSessionPattern = /^[A-Za-z0-9_-]{1,128}$/

/** Keep legacy Money parameter aliases (and the safe game return) through sign-in. */
export function subscriptionReturn(search: URLSearchParams) {
	const callbackUrl = safeCallbackPath(search.get('callbackUrl'))
	const rawS = search.get('s')
	const rawSessionId = search.get('session_id')
	const rawSession = (rawS ?? rawSessionId ?? search.get('checkout_session_id'))?.trim()
	const session = rawSession && checkoutSessionPattern.test(rawSession) ? rawSession : null
	const fromCheckout = search.get('checkout') === 'success' || session !== null
	const query = new URLSearchParams()
	if (fromCheckout) query.set('checkout', 'success')
	if (session) query.set(!rawS && rawSessionId ? 'session_id' : 's', session)
	if (callbackUrl) query.set('callbackUrl', callbackUrl)
	return {
		callbackUrl,
		session,
		fromCheckout,
		returnTo: query.size ? `${subscriptionPath}?${query}` : subscriptionPath,
	}
}

const SESSION_KEYS = ['s', 'session_id', 'checkout_session_id']

/** The address without the checkout session id, or null when it carries none. */
export function scrubbedReturnHref(href: string): string | null {
	const url = new URL(href)
	const present = SESSION_KEYS.filter((key) => url.searchParams.has(key))
	if (present.length === 0) return null
	for (const key of present) url.searchParams.delete(key)
	return `${url.pathname}${url.search}${url.hash}`
}

type ReturnWindow = {
	location: { href: string }
	history: { state: unknown; replaceState(state: unknown, unused: string, url: string): void }
}

/**
 * Once the page data holds the session, drop it from the address so a later
 * third-party tag (Meta's `dl`, gtag) can never read it. The router state is
 * kept, and `checkout=success` stays so a reload still shows the return.
 */
export function scrubCheckoutSession(win: ReturnWindow): boolean {
	const next = scrubbedReturnHref(win.location.href)
	if (next === null) return false
	win.history.replaceState(win.history.state, '', next)
	return true
}
