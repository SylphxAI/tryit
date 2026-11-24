/** GA4 conversions require effective analytics consent and an active GA destination. */

import {
	checkoutEntrySurface,
	trustedCheckoutTrigger,
	trustedEntrySurface,
} from './checkout-entry-surface'
import { hasAnalyticsConsent } from './consent'
import { sendGa4Event } from './google-tag'

export type Ga4KeyEventName = 'sign_up' | 'begin_checkout'

export type Ga4KeyEventParamsMap = {
	sign_up: {
		method?: string
		entry_surface?: string
	}
	begin_checkout: {
		plan?: string
		plan_sku?: string
		billing_interval?: string
		entry_surface?: string
		checkout_trigger?: string
		option?: string
		value?: number
		currency?: string
	}
}

export type Ga4KeyEventParams<E extends Ga4KeyEventName> = Ga4KeyEventParamsMap[E] &
	Record<string, unknown>

const ALLOWED_KEYS = new Set([
	'method',
	'entry_surface',
	'plan',
	'plan_sku',
	'billing_interval',
	'option',
	'checkout_trigger',
	'value',
	'currency',
])

const FORBIDDEN_PII_KEYS = new Set([
	'email',
	'email_address',
	'name',
	'username',
	'user_id',
	'userid',
	'phone',
	'phone_number',
	'address',
	'session_id',
	'sessionid',
	'token',
	'password',
	'url',
	'referrer',
])

function hasControlChar(value: string): boolean {
	for (let i = 0; i < value.length; i += 1) {
		const code = value.charCodeAt(i)
		if (code <= 0x1f || code === 0x7f) return true
	}
	return false
}

function sanitizeToken(value: unknown, maxLen = 120): string | undefined {
	if (typeof value !== 'string') return undefined
	const trimmed = value.trim()
	if (!trimmed || trimmed.includes('@') || hasControlChar(trimmed)) return undefined
	return trimmed.slice(0, maxLen)
}

function sanitizeParams(raw: Record<string, unknown>): Record<string, unknown> {
	const out: Record<string, unknown> = {}
	for (const [key, value] of Object.entries(raw)) {
		if (value === undefined || value === null) continue
		if (FORBIDDEN_PII_KEYS.has(key.toLowerCase()) || !ALLOWED_KEYS.has(key)) continue
		if (key === 'entry_surface' || key === 'checkout_trigger') {
			const trusted =
				key === 'entry_surface' ? trustedEntrySurface(value) : trustedCheckoutTrigger(value)
			if (trusted) out[key] = trusted
			continue
		}
		if (key === 'value') {
			if (typeof value === 'number' && Number.isFinite(value)) out.value = value
			continue
		}
		if (key === 'currency') {
			const clean = sanitizeToken(value, 8)
			if (clean) out.currency = clean.toUpperCase()
			continue
		}
		const clean = sanitizeToken(value)
		if (clean) out[key] = clean
	}
	return out
}

/**
 * Emits a consent-gated GA4 Key Event (`sign_up`, `begin_checkout`).
 * Returns `true` if the GA destination accepted dispatch, `false` if gated.
 */
export function trackGa4KeyEvent<E extends Ga4KeyEventName>(
	event: E,
	params: Ga4KeyEventParams<E>,
): boolean {
	if (typeof window === 'undefined') return false
	if (!hasAnalyticsConsent()) return false

	const raw = params as Record<string, unknown>
	const clean = sanitizeParams(raw)

	if (clean.entry_surface === undefined) {
		// Entry attribution can originate in a query string. Never send free-form text.
		const surface = checkoutEntrySurface(clean.checkout_trigger)
		if (surface) clean.entry_surface = surface
	}

	return sendGa4Event(event, clean)
}
