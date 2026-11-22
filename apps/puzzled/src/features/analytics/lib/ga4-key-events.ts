/** GA4 conversions require explicit analytics consent and an active GA destination. */

import { isComparisonSlug } from '@/features/marketing/components/comparison-slugs'
import { PAYWALL_CHECKOUT_TRIGGERS } from '@/features/plus-offer/lib/plus-offer'
import { readSessionEntrySurface } from '@/lib/attribution'
import { hasAnalyticsConsent } from './consent'
import { sendGa4Event } from './google-tag'

export type Ga4KeyEventName = 'sign_up' | 'begin_checkout' | 'purchase'

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
	purchase: {
		transaction_id?: string
		session_id?: string
		value: number
		currency: string
		plan?: string
		plan_sku?: string
		billing_interval?: string
		entry_surface?: string
		items?: { item_id: string }[]
	}
}

export type Ga4KeyEventParams<E extends Ga4KeyEventName> = Ga4KeyEventParamsMap[E] &
	Record<string, unknown>

const PURCHASE_FIRED_PREFIX = 'puzzled:ga4:purchase:'
const firedPurchaseKeys = new Set<string>()

const ALLOWED_KEYS = new Set([
	'method',
	'entry_surface',
	'plan',
	'plan_sku',
	'billing_interval',
	'option',
	'checkout_trigger',
	'transaction_id',
	'value',
	'currency',
	'items',
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

function trustedCheckoutTrigger(value: unknown): string | undefined {
	if (typeof value !== 'string') return undefined
	if (value === 'pricing_subscribe' || PAYWALL_CHECKOUT_TRIGGERS.has(value)) return value
}

function trustedEntrySurface(value: unknown): string | undefined {
	if (typeof value !== 'string') return undefined
	if (trustedCheckoutTrigger(value)) return value
	if (value.startsWith('seo_vs-') && isComparisonSlug(value.slice('seo_vs-'.length))) return value
	if (
		value === 'seo_vs-hub' ||
		value === 'seo_daily-word-and-logic-puzzles-online' ||
		value === 'seo_family-brain-games-no-ads'
	)
		return value
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
		if (key === 'items' && Array.isArray(value)) {
			const items = value
				.map((entry) => {
					const itemId = sanitizeToken((entry as { item_id?: unknown } | null)?.item_id)
					return itemId ? { item_id: itemId } : null
				})
				.filter((entry): entry is { item_id: string } => entry !== null)
			if (items.length > 0) out.items = items
			continue
		}
		const clean = sanitizeToken(value)
		if (clean) out[key] = clean
	}
	return out
}

function sessionStore(): Storage | undefined {
	if (typeof window === 'undefined') return undefined
	try {
		return window.sessionStorage ?? undefined
	} catch {
		return undefined
	}
}

function isPurchaseRecorded(dedupeId: string): boolean {
	if (firedPurchaseKeys.has(dedupeId)) return true
	try {
		return sessionStore()?.getItem(`${PURCHASE_FIRED_PREFIX}${dedupeId}`) === '1'
	} catch {
		return false
	}
}

function markPurchaseRecorded(dedupeId: string): void {
	firedPurchaseKeys.add(dedupeId)
	try {
		sessionStore()?.setItem(`${PURCHASE_FIRED_PREFIX}${dedupeId}`, '1')
	} catch {
		// Private mode: in-memory set still prevents duplicates in this document.
	}
}

/** Test-only: clears in-memory purchase deduplication marks. */
export function resetGa4KeyEventsForTests(): void {
	firedPurchaseKeys.clear()
}

/**
 * Emits a consent-gated GA4 Key Event (`sign_up`, `begin_checkout`, `purchase`).
 * Returns `true` if the GA destination accepted dispatch, `false` if gated or deduplicated.
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
		const surface =
			trustedEntrySurface(readSessionEntrySurface(sessionStore())) ?? clean.checkout_trigger
		if (surface) clean.entry_surface = surface
	}

	if (event === 'purchase') {
		const dedupeId = sanitizeToken(clean.transaction_id, 255) ?? sanitizeToken(raw.session_id, 255)
		if (!dedupeId) return false
		if (!clean.transaction_id) clean.transaction_id = dedupeId
		if (isPurchaseRecorded(dedupeId)) return false
		if (!sendGa4Event(event, clean)) return false
		markPurchaseRecorded(dedupeId)
		return true
	}
	return sendGa4Event(event, clean)
}
