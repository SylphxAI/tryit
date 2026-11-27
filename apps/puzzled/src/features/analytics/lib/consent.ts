import { uuidv7 } from '@sylphx/sdk/runtime'
import {
	createSignalBrowser,
	resolveEffectiveConsent,
	type SignalConsentChoice,
} from '@sylphx/sdk/signal'
import { CONSENT_KEY, CONSENT_VERSION_KEY, SIGNAL_STORAGE_KEY } from '@/lib/storage-keys'

export type SignalStream = { apiKey: string; baseUrl: string }
export type ConsentContext = { region: 'EEA' | 'ROW'; gpc: boolean; stream?: SignalStream }
const EVENT = 'consent-change'
const TOUCH_KEY = `${SIGNAL_STORAGE_KEY}.touch`
export const CHECKOUT_QUOTE_KEY = 'puzzled:ads:checkout-quote'
/**
 * The cookie-consent version every new save records. In opt-in regions (including
 * unknown regions), Meta (Pixel and fbc/fbp in the Events binding) needs a saved grant
 * at or after META_CONSENT_VERSION; an older grant keeps Google as it was and
 * leaves Meta off until re-confirmed in Cookie settings. No banner is re-shown.
 */
export const CONSENT_VERSION = '2026-11-27'
const META_CONSENT_VERSION = '2026-11-27'
let context: ConsentContext | null = null
let localDenial = false
let browser: ReturnType<typeof createSignalBrowser> | undefined
let session: { id: string; route?: string | null; navigation: number; stages: number } | undefined

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

function savedConsentVersion(): string | null {
	try {
		return window.localStorage.getItem(CONSENT_VERSION_KEY)
	} catch {
		return null
	}
}

/**
 * Minor hook, fail closed: true for an account flagged under 18 (via support
 * or legal). No account carries an age signal today, so nothing sets it yet;
 * when Auth or the account exposes one, set it here and Meta stays off.
 */
let accountUnder18 = false

export function setAccountUnder18(flagged: boolean): void {
	accountUnder18 = flagged
}

/**
 * The single Meta gate (Pixel load, fbclid/fbc/fbp to the Events binding).
 * - Never under GPC (Sec-GPC or navigator.globalPrivacyControl) or for a
 *   flagged minor.
 * - Opt-out regions: eligible by default, like Google's click IDs; a saved
 *   refusal or analytics-only choice turns it off.
 * - Opt-in and unknown regions: require a saved full grant made at
 *   or after META_CONSENT_VERSION. An older grant never unlocks Meta.
 */
export function canUseMeta(): boolean {
	const { signals, gpc } = cookieConsent()
	if (gpc || accountUnder18 || !context) return false
	if (signals.ad_storage !== 'granted' || signals.ad_user_data !== 'granted') return false
	if (context.region === 'ROW') return true
	const version = savedConsentVersion()
	return (
		canStoreMarketing() &&
		version !== null &&
		/^\d{4}-\d{2}-\d{2}$/.test(version) &&
		version >= META_CONSENT_VERSION
	)
}

export function notifyConsentChange(): void {
	window.dispatchEvent(new Event(EVENT))
}

function resetBrowser() {
	browser?.dispose()
	browser = undefined
	session = undefined
}

let landingHref: string | null = null

/**
 * Hold the landing address in memory only, until consent context is known, so
 * an ad visitor who navigates before /api/consent-context resolves keeps the
 * landing click ids and UTMs. The SDK still decides what it may persist.
 */
export function rememberLanding(href: string): void {
	landingHref ??= href
}

/** One SDK capture against the landing address, restored synchronously. */
function captureLanding() {
	const href = landingHref
	landingHref = null
	if (!href || !browser) return
	const { location, history } = window
	const here = location.href
	const landing = new URL(href, here)
	if (landing.origin !== new URL(here).origin || landing.href === here) return
	for (const key of ['s', 'session_id', 'checkout_session_id']) landing.searchParams.delete(key)
	const state = history.state
	try {
		history.replaceState(state, '', landing.href)
		browser.capture()
	} finally {
		history.replaceState(state, '', here)
	}
}

function syncBrowser() {
	const consent = cookieConsent()
	// A refusal or GPC discards the remembered landing; nothing was persisted.
	if (context && (consent.gpc || storedChoice() === 'denied')) landingHref = null
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
	if (id) session = { id, navigation: 0, stages: 0 }
	captureLanding()
}

export function setConsentContext(value: ConsentContext | null): void {
	resetBrowser()
	context = value
	if (!value) landingHref = null
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

/**
 * A funnel stage on the same opt-in stream as page views: nothing is sent
 * without a saved analytics grant, in EEA before a choice, or under GPC.
 * Callers pass already-allowlisted properties (see signal-stages.ts).
 */
export function trackSignalEvent(
	eventName: string,
	properties: Record<string, string | number | boolean>,
	options: { eventId?: string; numericValue?: number } = {},
): boolean {
	try {
		syncBrowser()
		if (!browser || !session) return false
		const eventId = options.eventId ?? `${session.id}:${eventName}:${++session.stages}`
		void browser
			.track({ eventName, eventId, properties, numericValue: options.numericValue })
			.catch(() => {})
		return true
	} catch {
		return false
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
		window.localStorage.setItem(CONSENT_VERSION_KEY, CONSENT_VERSION)
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
