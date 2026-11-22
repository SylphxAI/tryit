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
