import type { SignalAttribution } from '@sylphx/sdk/signal'
import { safeReturnPath } from '@/lib/identity/return-path'

export const SIGNUP_ATTRIBUTION_COOKIE = 'puzzled_signup_attr'
const MAX_AGE = 30 * 24 * 60 * 60

/** Only the product-specific referral identifier is outside the Signal contract.
 * Keep the signup first-touch record free of ad identifiers and browser URLs. */
export function syncReferral({
	pathname,
	search,
	touch,
	granted,
}: {
	pathname: string
	search: string
	touch: SignalAttribution
	granted: boolean
}) {
	const cookie = document.cookie
	const has = (name: string) => cookie.split(';').some((pair) => pair.trim().startsWith(`${name}=`))
	const attrs = `; Path=/; SameSite=Lax${window.location.protocol === 'https:' ? '; Secure' : ''}`
	if (has('puzzled_attr')) {
		// biome-ignore lint/suspicious/noDocumentCookie: remove retired tracking cookie
		document.cookie = `puzzled_attr=${attrs}; Max-Age=0`
	}
	if (!granted) {
		if (has(SIGNUP_ATTRIBUTION_COOKIE)) {
			// biome-ignore lint/suspicious/noDocumentCookie: withdraw signup attribution
			document.cookie = `${SIGNUP_ATTRIBUTION_COOKIE}=${attrs}; Max-Age=0`
		}
		return
	}
	if (has(SIGNUP_ATTRIBUTION_COOKIE)) return
	const params = new URLSearchParams(search)
	const next = safeReturnPath(params.get('nextUrl'))
	const embedded = next ? new URL(next, window.location.origin).searchParams.get('ref') : null
	const ref = params.get('ref') ?? embedded ?? pathname.match(/\/r\/([0-9a-f-]{36})$/i)?.[1]
	const tags = new URLSearchParams()
	if (ref && /^[A-Za-z0-9_-]{1,100}$/.test(ref)) tags.set('r', ref)
	for (const [key, value] of Object.entries({
		s: touch.utm_source,
		m: touch.utm_medium,
		c: touch.utm_campaign,
		t: touch.utm_term,
		n: touch.utm_content,
	})) {
		if (value && !value.includes('@')) tags.set(key, value.slice(0, 100))
	}
	if (!tags.size) return
	// biome-ignore lint/suspicious/noDocumentCookie: consented first-party signup attribution
	document.cookie =
		SIGNUP_ATTRIBUTION_COOKIE +
		'=' +
		encodeURIComponent(tags.toString()) +
		attrs +
		'; Max-Age=' +
		MAX_AGE
}
