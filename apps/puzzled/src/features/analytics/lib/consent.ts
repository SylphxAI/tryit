import {
	ATTRIBUTION_SESSION_KEY,
	CONSENT_KEY,
	CONSENT_TIMESTAMP_KEY,
	MARKETING_CONSENT_KEY,
} from '@/lib/storage-keys'
import type { ConsentRegion } from './consent-region'

export type ConsentStatus = 'pending' | 'accepted' | 'declined'
export type ConsentContext = { region: ConsentRegion; gpc: boolean }

export function resolveConsent(input: {
	context: ConsentContext | null
	browserGpc: boolean
	status: ConsentStatus
	marketing: ConsentStatus
	storageAvailable: boolean
}) {
	const { context, status, marketing, storageAvailable } = input
	const gpc = input.browserGpc || context?.gpc === true
	const available = context !== null && storageAvailable && !gpc
	return {
		gpc,
		ready: context !== null,
		status,
		storageAvailable,
		prompt: available && context.region === 'eea' && status === 'pending',
		analytics:
			available &&
			(status === 'accepted' || (status === 'pending' && context.region === 'non-eea')),
		marketing: available && status === 'accepted' && marketing === 'accepted',
	}
}

let context: ConsentContext | null = null
let optedOut = false

function statusOf(value: string | null): ConsentStatus {
	return value === 'accepted' || value === 'declined' ? value : 'pending'
}

export function cookieConsent() {
	const browserGpc =
		typeof navigator !== 'undefined' &&
		(navigator as Navigator & { globalPrivacyControl?: boolean }).globalPrivacyControl === true
	let status: ConsentStatus = 'pending'
	let marketing: ConsentStatus = 'pending'
	let storageAvailable = false
	try {
		if (typeof window !== 'undefined') {
			status = statusOf(window.localStorage.getItem(CONSENT_KEY))
			marketing = statusOf(window.localStorage.getItem(MARKETING_CONSENT_KEY))
			storageAvailable = true
		}
	} catch {
		// An unreadable stored opt-out must not be treated as a default grant.
	}
	return resolveConsent({
		context,
		browserGpc,
		status: optedOut ? 'declined' : status,
		marketing,
		storageAvailable,
	})
}

/** Effective permission for Google Analytics, including a regional default. */
export function canTrackAnalytics(): boolean {
	return cookieConsent().analytics
}

/** Other integrations retain their explicit-grant boundary. */
export function hasAnalyticsConsent(): boolean {
	const consent = cookieConsent()
	return consent.analytics && consent.status === 'accepted'
}

export function canStoreMarketing(): boolean {
	return cookieConsent().marketing
}

const EVENT = 'consent-change'

export function notifyConsentChange(): void {
	window.dispatchEvent(new Event(EVENT))
}

export function setConsentContext(value: ConsentContext | null): void {
	context = value
	if (typeof window !== 'undefined') notifyConsentChange()
}

export function onConsentChange(callback: () => void): () => void {
	if (typeof window === 'undefined') return () => {}
	window.addEventListener(EVENT, callback)
	return () => window.removeEventListener(EVENT, callback)
}

export const CHECKOUT_QUOTE_KEY = 'puzzled:ads:checkout-quote'

export function saveCookieChoice(status: 'accepted' | 'declined'): void {
	const consent = cookieConsent()
	if (status === 'accepted' && (!consent.ready || consent.gpc || !consent.storageAvailable)) return
	if (status === 'declined') optedOut = true
	try {
		// The analytics buttons grant analytics only and revoke any historic ad grant.
		if (status === 'declined') window.localStorage.setItem(CONSENT_KEY, status)
		window.localStorage.setItem(MARKETING_CONSENT_KEY, 'declined')
		window.localStorage.setItem(CONSENT_TIMESTAMP_KEY, new Date().toISOString())
		if (status === 'accepted') window.localStorage.setItem(CONSENT_KEY, status)
		if (status === 'accepted') optedOut = false
	} catch {
		// An unsuccessful grant must not enable tracking. A decline still applies now.
	}
	if (status === 'declined') {
		try {
			window.localStorage.removeItem(CHECKOUT_QUOTE_KEY)
			window.sessionStorage.removeItem(ATTRIBUTION_SESSION_KEY)
		} catch {
			// Non-essential storage may be blocked.
		}
	}
	notifyConsentChange()
}
