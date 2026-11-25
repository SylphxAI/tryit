/**
 * Google tag (gtag.js) for GA4 and Google Ads, consent first.
 *
 * Basic consent mode: queue defaults and effective consent before loading any
 * remote code. Signal resolves the regional defaults and stored choices.
 *
 * The page address and title sent to Google are limited to an
 * allowlist of public marketing paths; a game, share or account URL never
 * reaches Google. With no ids configured the whole module is inert.
 */

import { resolveEffectiveConsent, type SignalConsent } from '@sylphx/sdk/signal'
import { CHECKOUT_QUOTE_KEY } from './consent'

export type GoogleTagIds = {
	ga: string | null
	ads: string | null
	adsPurchaseLabel: string | null
}

type IdSource = {
	GA_MEASUREMENT_ID?: string
	GOOGLE_ADS_ID?: string
	GOOGLE_ADS_PURCHASE_LABEL?: string
}

const GA_ID = /^G-[A-Z0-9]{4,20}$/
const ADS_ID = /^AW-\d{6,15}$/
const ADS_LABEL = /^[A-Za-z0-9_-]{4,64}$/
const CHECKOUT_SESSION_ID = /^[A-Za-z0-9_-]{6,128}$/

/** Validated ids, or null when neither is configured (nothing loads). */
export function googleTagIds(source: IdSource): GoogleTagIds | null {
	const ga = source.GA_MEASUREMENT_ID?.trim() ?? ''
	const adsId = source.GOOGLE_ADS_ID?.trim() ?? ''
	const ads = ADS_ID.test(adsId) ? adsId : null
	const label = source.GOOGLE_ADS_PURCHASE_LABEL?.trim() ?? ''
	const ids = {
		ga: GA_ID.test(ga) ? ga : null,
		ads,
		adsPurchaseLabel: ads && ADS_LABEL.test(label) ? label : null,
	}
	return ids.ga || ids.ads ? ids : null
}

const DENIED = resolveEffectiveConsent({ storedChoice: 'denied' })

const SITE_TITLE = 'Tryit'

const LOCALE_PREFIX = /^\/(en-GB|zh-HK|zh-CN|zh-TW|ja|es|pt-BR)(?=\/|$)/
const PUBLIC_PATHS = new Set([
	'/',
	'/pricing',
	'/privacy',
	'/terms',
	'/delete-account',
	'/support',
	'/sign-in',
])

/** The path Google may see for this route, or null for any other route. */
export function trackablePath(pathname: string): string | null {
	const stripped = pathname.replace(LOCALE_PREFIX, '') || '/'
	const path = stripped.length > 1 ? stripped.replace(/\/+$/, '') : stripped
	return PUBLIC_PATHS.has(path) ? path : null
}

const GOOGLE_COOKIE =
	/^(_ga(?:_[a-z0-9_-]+)?|_gid|_gat.*|_gcl_[a-z]+|_gac_.+|__gads|__gpi|_fbc|_fbp)$/i

const ANALYTICS_COOKIE = /^(_ga(?:_[a-z0-9_-]+)?|_gid|_gat.*)$/i

/** Names of measurement cookies in a `document.cookie` string. */
export function googleCookieNames(cookies: string): string[] {
	return cookies
		.split(';')
		.map((pair) => pair.trim().split('=')[0] ?? '')
		.filter((name) => GOOGLE_COOKIE.test(name))
}

/** Expire measurement cookies on this host and its parent domains. */
export function deleteGoogleCookies(
	doc: { cookie: string },
	hostname: string,
	adsOnly = false,
): void {
	const parts = hostname.split('.')
	const domains = ['']
	for (let i = 0; i < parts.length - 1; i += 1)
		domains.push(`; Domain=.${parts.slice(i).join('.')}`)
	for (const name of googleCookieNames(doc.cookie)) {
		if (adsOnly && ANALYTICS_COOKIE.test(name)) continue
		for (const domain of domains) {
			doc.cookie = `${name}=; Path=/; Max-Age=0${domain}`
		}
	}
}

type GtagFn = (...args: unknown[]) => void

export type TagWindow = {
	dataLayer?: unknown[]
	gtag?: GtagFn
	location: { origin: string; hostname: string }
	localStorage?: { getItem(key: string): string | null; setItem(key: string, value: string): void }
} & Record<string, unknown>

export type TagDocument = {
	cookie: string
	head: { appendChild(node: unknown): unknown }
	createElement(tag: 'script'): { src: string; async: boolean }
}

export type GoogleTagController = {
	/** Apply the current stored consent: load, configure or withdraw. */
	sync(allowLoad?: boolean): void
	/** A page view for a route; only allowlisted public routes are reported. */
	pageView(pathname: string, title: string | null): boolean
	/** A conversion event to the destinations the visitor consented to. */
	event(name: string, params: Record<string, unknown>): boolean
	/** Has the visitor granted anything a Google destination could use? */
	hasConsent(): boolean
	gaEvent(name: string, params: Record<string, unknown>): boolean
	canSendAdsPurchase(): boolean
	adsPurchase(input: { value: number; currency: string; transactionId: string }): boolean
}

/** Characters allowed in an event parameter string: nothing that can carry an address. */
function safeText(value: string): string {
	return value.replace(/[^A-Za-z0-9_.:-]/g, '').slice(0, 100)
}

/** Keep only the parameters conversions need; strings are reduced to a safe charset. */
export function cleanEventParams(params: Record<string, unknown>): Record<string, unknown> {
	const out: Record<string, unknown> = {}
	for (const [key, value] of Object.entries(params)) {
		if (key === 'value' && typeof value === 'number' && Number.isFinite(value)) out[key] = value
		else if (key === 'currency' && typeof value === 'string')
			out[key] = safeText(value).toUpperCase().slice(0, 3)
		else if (
			(key === 'method' || key === 'plan' || key === 'transaction_id') &&
			typeof value === 'string'
		)
			out[key] = safeText(value)
		else if (key === 'items' && Array.isArray(value)) {
			out[key] = value.flatMap((item) => {
				const id = (item as { item_id?: unknown } | null)?.item_id
				return typeof id === 'string' ? [{ item_id: safeText(id) }] : []
			})
		}
	}
	return out
}

function allowsAds(choice: SignalConsent): boolean {
	return choice.ad_storage === 'granted' && choice.ad_user_data === 'granted'
}

export function createGoogleTag(input: {
	ids: GoogleTagIds
	win: TagWindow
	doc: TagDocument
	consent: () => SignalConsent
}): GoogleTagController {
	const { ids, win, doc } = input
	const base = `${win.location.origin}/`
	let previous: SignalConsent | undefined
	let loaded = false
	let gaOn = false
	let adsOn = false
	let lastPath: string | null = null

	function gtag(...args: unknown[]) {
		win.dataLayer = win.dataLayer ?? []
		if (!win.gtag) {
			// gtag.js reads `arguments` objects from the data layer, not arrays.
			win.gtag = function pushArguments() {
				// biome-ignore lint/complexity/noArguments: the data layer needs the arguments object
				win.dataLayer?.push(arguments)
			}
		}
		win.gtag(...args)
	}

	function load(firstId: string) {
		// Google initializes the destination on the first js/config command, before
		// the per-destination config is applied. Set this globally before startup.
		gtag('set', {
			send_page_view: false,
			page_location: base,
			page_referrer: '',
			page_title: SITE_TITLE,
		})
		// Enhanced Measurement history and site search can bypass these defaults
		// and read the raw URL. Keep the app as the only page-view producer even
		// if these features are enabled on the stream.
		gtag('set', 'gtm.blocklist', ['ccd_em_page_view', 'ccd_em_site_search'])
		gtag('js', new Date())
		const script = doc.createElement('script')
		script.async = true
		script.src = `https://www.googletagmanager.com/gtag/js?id=${firstId}`
		doc.head.appendChild(script)
		loaded = true
	}

	function targets(): string[] {
		return [gaOn && ids.ga, adsOn && allowsAds(input.consent()) && ids.ads].filter(
			(id): id is string => Boolean(id),
		)
	}

	function canSendAdsPurchase(): boolean {
		return loaded && adsOn && Boolean(ids.ads && ids.adsPurchaseLabel) && allowsAds(input.consent())
	}

	return {
		sync(allowLoad = true) {
			const choice = input.consent()
			const wantGa = Boolean(ids.ga) && choice.analytics_storage === 'granted'
			const wantAds = Boolean(ids.ads) && allowsAds(choice)
			if (!previous) {
				previous = allowLoad ? choice : DENIED
				gtag('consent', 'default', previous)
			}
			if (
				previous.analytics_storage !== choice.analytics_storage ||
				previous.ad_storage !== choice.ad_storage ||
				previous.ad_user_data !== choice.ad_user_data ||
				previous.ad_personalization !== choice.ad_personalization
			) {
				previous = choice
				gtag('consent', 'update', choice)
			}
			if (ids.ga && !wantGa) win[`ga-disable-${ids.ga}`] = true
			if (ids.ads && !wantAds) win[`ga-disable-${ids.ads}`] = true
			if (!wantGa && !wantAds) {
				deleteGoogleCookies(doc, win.location.hostname)
				gaOn = false
				adsOn = false
				lastPath = null
				return
			}
			if (!allowsAds(choice)) deleteGoogleCookies(doc, win.location.hostname, true)
			if (!loaded && !allowLoad) return
			if (gaOn === wantGa && adsOn === wantAds) return
			const first = wantGa ? ids.ga : ids.ads
			if (!loaded && first) load(first)
			if (wantGa && ids.ga && !gaOn) {
				win[`ga-disable-${ids.ga}`] = false
				gtag('config', ids.ga, {
					send_page_view: false,
					allow_google_signals: false,
					allow_ad_personalization_signals: false,
				})
			}
			if (wantAds && ids.ads && !adsOn) {
				win[`ga-disable-${ids.ads}`] = false
				gtag('config', ids.ads, {
					allow_google_signals: false,
					allow_ad_personalization_signals: false,
					allow_enhanced_conversions: false,
				})
			}
			gaOn = wantGa
			adsOn = wantAds
		},
		pageView(pathname, title) {
			// Preserve the locale of a public URL, but never include a query or fragment.
			const path = trackablePath(pathname) !== null ? pathname.replace(/\/+$/, '') || '/' : null
			const page = {
				page_location: path && title ? `${win.location.origin}${path}` : base,
				page_referrer: '',
				page_title: path && title ? title : SITE_TITLE,
			}
			if (loaded) gtag('set', page)
			if (!gaOn || !path || !title || path === lastPath) {
				if (!path) lastPath = null
				return false
			}
			lastPath = path
			gtag('event', 'page_view', { ...page, send_to: ids.ga })
			return true
		},
		hasConsent() {
			const choice = input.consent()
			return (
				(Boolean(ids.ga) && choice.analytics_storage === 'granted') ||
				(Boolean(ids.ads) && allowsAds(choice))
			)
		},
		gaEvent(name, params) {
			if (!gaOn || input.consent().analytics_storage !== 'granted') return false
			gtag('event', name, { ...params, send_to: ids.ga })
			return true
		},
		canSendAdsPurchase,
		adsPurchase({ value, currency, transactionId }) {
			if (!canSendAdsPurchase()) return false
			if (!Number.isFinite(value) || value <= 0 || !/^[A-Za-z]{3}$/.test(currency)) return false
			if (!CHECKOUT_SESSION_ID.test(transactionId)) return false
			gtag('event', 'conversion', {
				send_to: `${ids.ads}/${ids.adsPurchaseLabel}`,
				value,
				currency: currency.toUpperCase(),
				transaction_id: transactionId,
			})
			return true
		},
		event(name, params) {
			const sendTo = targets()
			if (!loaded || input.consent().analytics_storage !== 'granted' || sendTo.length === 0)
				return false
			gtag('event', name, { ...cleanEventParams(params), send_to: sendTo })
			return true
		},
	}
}

let active: GoogleTagController | null = null

/** Make a controller the one conversion helpers talk to (null clears it). */
export function setActiveGoogleTag(controller: GoogleTagController | null): void {
	active = controller
}

/** Dispatch fields already sanitized by the GA4 key-event bridge. */
export function sendGa4Event(name: string, params: Record<string, unknown>): boolean {
	return active?.gaEvent(name, params) ?? false
}

export type CheckoutQuote = { plan: string; value: number; currency: string }

const SENT_PREFIX = 'puzzled:ads:sent:'

type Store = {
	getItem(key: string): string | null
	setItem(key: string, value: string): void
	removeItem(key: string): void
}

function store(): Store | null {
	try {
		return typeof window === 'undefined' ? null : window.localStorage
	} catch {
		return null
	}
}

/** The plan and price being checked out, kept until the return page reports it. */
export function rememberCheckoutQuote(quote: CheckoutQuote): void {
	if (!active?.hasConsent()) return
	const { plan, value, currency } = quote
	if (!/^[A-Z]{3}$/.test(currency) || !Number.isFinite(value) || value <= 0) return
	try {
		store()?.setItem(CHECKOUT_QUOTE_KEY, JSON.stringify({ plan, value, currency }))
	} catch {
		// Private mode: no quote, so no conversion value; checkout is unaffected.
	}
}

function readQuote(storage: Store): CheckoutQuote | null {
	try {
		const raw = JSON.parse(
			storage.getItem(CHECKOUT_QUOTE_KEY) ?? 'null',
		) as Partial<CheckoutQuote> | null
		if (
			raw &&
			typeof raw.plan === 'string' &&
			typeof raw.currency === 'string' &&
			typeof raw.value === 'number' &&
			raw.value > 0
		) {
			return { plan: raw.plan, value: raw.value, currency: raw.currency }
		}
	} catch {
		// fall through
	}
	return null
}

function fireOnce(storage: Store, key: string, send: () => boolean): boolean {
	const marker = SENT_PREFIX + key
	try {
		if (storage.getItem(marker)) return false
		storage.setItem(marker, '1')
		if (send()) return true
		storage.removeItem(marker)
	} catch {
		// Without a readable and writable marker, measurement must fail closed.
	}
	return false
}

/** `sign_up` for a new account. The caller reads its one-shot marker, so a reload cannot repeat it. */
export function trackSignUp(method: string): boolean {
	return active?.event('sign_up', { method }) ?? false
}

/** Report a trial at the existing destinations once, then clear its stored quote. */
export function trackCheckoutTrialStart(input: { sessionId: string }): boolean {
	const storage = store()
	if (!active || !storage || !/^[A-Za-z0-9_]{6,200}$/.test(input.sessionId)) return false
	const quote = readQuote(storage)
	if (!quote) return false
	const tag = active
	const sent = fireOnce(storage, `trialing:${input.sessionId}`, () =>
		tag.event('trial_start', {
			value: quote.value,
			currency: quote.currency,
			plan: quote.plan,
			items: [{ item_id: quote.plan }],
		}),
	)
	if (sent) clearCheckoutQuote()
	return sent
}

export function clearCheckoutQuote(): void {
	try {
		store()?.removeItem(CHECKOUT_QUOTE_KEY)
	} catch {
		// Measurement must not interrupt the checkout return.
	}
}

/** Report Ads attribution only; Money still owns the paid purchase record. */
export function trackCheckoutPurchase({ sessionId }: { sessionId: string }): boolean {
	const tag = active
	const storage = store()
	if (!tag?.canSendAdsPurchase() || !storage || !CHECKOUT_SESSION_ID.test(sessionId)) return false
	const quote = readQuote(storage)
	if (!quote) return false
	const sent = fireOnce(storage, `paid:${sessionId}`, () =>
		tag.adsPurchase({ value: quote.value, currency: quote.currency, transactionId: sessionId }),
	)
	if (sent) clearCheckoutQuote()
	return sent
}
