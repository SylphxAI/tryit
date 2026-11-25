import { uuidv7 } from '@sylphx/sdk/runtime'
import {
	createSignalBrowser,
	resolveEffectiveConsent,
	type SignalConsentChoice,
} from '@sylphx/sdk/signal'
import { CONSENT_KEY, SIGNAL_STORAGE_KEY } from '@/lib/storage-keys'

export type SignalStream = { apiKey: string; baseUrl: string }
export type ConsentContext = { region: 'EEA' | 'ROW'; gpc: boolean; stream?: SignalStream }
const EVENT = 'consent-change'
const TOUCH_KEY = `${SIGNAL_STORAGE_KEY}.touch`
export const CHECKOUT_QUOTE_KEY = 'puzzled:ads:checkout-quote'
let context: ConsentContext | null = null
let localDenial = false
let browser: ReturnType<typeof createSignalBrowser> | undefined
let session: { id: string; route?: string | null; navigation: number } | undefined

function storedChoice(): SignalConsentChoice | null | undefined {
	try {
		const value = window.localStorage.getItem(CONSENT_KEY)
		return value === null || value === 'granted' || value === 'analytics_only' ? value : 'denied'
	} catch {
		return undefined
	}
}

export function cookieConsent() {
	const gpc =
		context?.gpc === true ||
		(typeof navigator !== 'undefined' && Reflect.get(navigator, 'globalPrivacyControl') === true)
	const choice = storedChoice()
	const signals = resolveEffectiveConsent({
		region: context?.region,
		gpc,
		storedChoice:
			!context || localDenial || choice === undefined ? 'denied' : (choice ?? undefined),
	})
	return {
		signals,
		gpc,
		ready: context !== null,
		storageAvailable: context !== null && choice !== undefined,
		prompt: context?.region === 'EEA' && !gpc && !localDenial && choice === null,
		analytics: signals.analytics_storage === 'granted',
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

function resetBrowser() {
	browser?.dispose()
	browser = undefined
	session = undefined
}

function syncBrowser() {
	const consent = cookieConsent()
	if (!context || !consent.analytics) {
		resetBrowser()
		if (context) {
			try {
				window.localStorage.removeItem(TOUCH_KEY)
			} catch {
				// Refusal still suppresses collection when storage is unavailable.
			}
		}
		return
	}
	// Keep the existing ROW checkout attribution default. Only configure
	// ingestion after a real saved choice; EEA never initializes pre-grant.
	const stream = consent.explicit ? context.stream : undefined
	if (browser && Boolean(session) !== Boolean(stream)) resetBrowser()
	if (browser) return
	const id = stream ? uuidv7() : undefined
	browser = createSignalBrowser({
		region: context.region,
		gpc: context.gpc,
		storageKey: SIGNAL_STORAGE_KEY,
		ingest:
			stream && id
				? {
						...stream,
						sessionId: id,
						distinctId: id,
						fetch: ((input, init) => {
							const current = cookieConsent()
							if (!current.analytics || !current.explicit)
								return Promise.reject(new Error('Signal consent unavailable'))
							return fetch(input, { ...init, signal: AbortSignal.timeout(10_000) })
						}) as typeof fetch,
					}
				: undefined,
	})
	if (id) session = { id, navigation: 0 }
}

export function setConsentContext(value: ConsentContext | null): void {
	resetBrowser()
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
		} catch {
			// If an old choice cannot be carried forward, do not assume ROW consent.
			localDenial = true
		}
	}
	if (typeof window !== 'undefined') notifyConsentChange()
}

export function captureSignalTouch() {
	try {
		syncBrowser()
		return browser?.capture() ?? {}
	} catch {
		return {}
	}
}

/** One view per committed public-route visit; query-only updates are not visits. */
export function trackSignalPage(path: string | null): void {
	try {
		syncBrowser()
		if (!browser || !session || session.route === path) return
		session.route = path
		if (!path) return
		const eventId = `${session.id}:page_view:${++session.navigation}`
		void browser.track({ eventName: 'page_view', eventId, properties: { path } }).catch(() => {})
	} catch {
		// Measurement must never interrupt navigation.
	}
}

export function onConsentChange(callback: () => void): () => void {
	if (typeof window === 'undefined') return () => {}
	window.addEventListener(EVENT, callback)
	return () => window.removeEventListener(EVENT, callback)
}

export function saveCookieChoice(choice: SignalConsentChoice): void {
	const consent = cookieConsent()
	if (!context || (choice !== 'denied' && (consent.gpc || !consent.storageAvailable))) return
	try {
		window.localStorage.setItem(CONSENT_KEY, choice)
		localDenial = false
	} catch {
		if (choice === 'denied') localDenial = true
	}
	if (choice === 'denied') {
		try {
			window.localStorage.removeItem(CHECKOUT_QUOTE_KEY)
		} catch {
			// Non-essential storage may be blocked.
		}
	}
	// Clear stored IDs on refusal/downgrade even if no route is tracking.
	captureSignalTouch()
	notifyConsentChange()
}
