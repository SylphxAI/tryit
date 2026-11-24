import { createSignalBrowser, resolveEffectiveConsent } from '@sylphx/sdk/signal'
import { CONSENT_KEY, SIGNAL_STORAGE_KEY } from '@/lib/storage-keys'

export type ConsentContext = { region: 'EEA' | 'ROW'; gpc: boolean }
const EVENT = 'consent-change'
export const CHECKOUT_QUOTE_KEY = 'puzzled:ads:checkout-quote'
let context: ConsentContext | null = null
let browser: ReturnType<typeof createSignalBrowser> | undefined

function storedChoice() {
	try {
		return window.localStorage.getItem(CONSENT_KEY)
	} catch {
		return undefined
	}
}

export function cookieConsent() {
	const signals = browser?.getConsent() ?? resolveEffectiveConsent({ storedChoice: 'denied' })
	const gpc =
		context?.gpc === true ||
		(typeof navigator !== 'undefined' && Reflect.get(navigator, 'globalPrivacyControl') === true)
	const choice = storedChoice()
	const analytics = signals.analytics_storage === 'granted'
	return {
		signals,
		gpc,
		ready: context !== null,
		storageAvailable: browser !== undefined && choice !== undefined,
		prompt: browser !== undefined && context?.region === 'EEA' && !gpc && choice === null,
		analytics,
		marketing: signals.ad_storage === 'granted',
		explicit: choice === 'granted' || choice === 'analytics_only',
	}
}

export function hasAnalyticsConsent(): boolean {
	return cookieConsent().analytics
}

/** Linking a shared-result visit to a player still requires affirmative consent. */
export function hasExplicitAnalyticsConsent(): boolean {
	const consent = cookieConsent()
	return consent.analytics && consent.explicit
}

export function canStoreMarketing(): boolean {
	const consent = cookieConsent()
	return consent.marketing && consent.explicit
}

export function notifyConsentChange(): void {
	window.dispatchEvent(new Event(EVENT))
}

export function setConsentContext(value: ConsentContext | null): void {
	browser?.dispose()
	browser = undefined
	context = value
	if (value) {
		// Migrate affirmative choices without upgrading analytics-only grants.
		try {
			const storage = window.localStorage
			if (storage.getItem(CONSENT_KEY) === null) {
				const analytics = storage.getItem('puzzled:consent:cookie')
				const marketing = storage.getItem('puzzled:consent:marketing')
				if (analytics !== null || marketing !== null) {
					storage.setItem(
						CONSENT_KEY,
						analytics === 'accepted'
							? marketing === 'accepted'
								? 'granted'
								: 'analytics_only'
							: 'denied',
					)
				}
			}
			browser = createSignalBrowser({ ...value, storageKey: SIGNAL_STORAGE_KEY })
		} catch {
			// If an old choice cannot be read or carried forward, leave defaults off.
		}
	}
	if (typeof window !== 'undefined') notifyConsentChange()
}

export function captureSignalTouch() {
	return browser?.capture() ?? {}
}

export function onConsentChange(callback: () => void): () => void {
	if (typeof window === 'undefined') return () => {}
	window.addEventListener(EVENT, callback)
	return () => window.removeEventListener(EVENT, callback)
}

export function saveCookieChoice(
	choice: Parameters<ReturnType<typeof createSignalBrowser>['setConsent']>[0],
): void {
	const consent = cookieConsent()
	if (choice !== 'denied' && (consent.gpc || !consent.storageAvailable)) return
	browser?.setConsent(choice)
	if (choice === 'denied') {
		try {
			window.localStorage.removeItem(CHECKOUT_QUOTE_KEY)
		} catch {
			// Non-essential storage may be blocked.
		}
	}
	notifyConsentChange()
}
