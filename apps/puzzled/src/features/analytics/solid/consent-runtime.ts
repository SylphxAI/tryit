import { useIsRouting, useLocation } from '@solidjs/router'
import { createEffect, onCleanup, onMount } from 'solid-js'
import { subscriptionReturn } from '@/features/settings/solid/subscription-return'
import { consumeSignUpCookie, type SignUpMethod } from '@/lib/identity/after-sign-up'
import { CONSENT_KEY } from '@/lib/storage-keys'
import { syncEntrySurface } from '../lib/checkout-entry-surface'
import { setCheckoutMeasurementId } from '../lib/checkout-signal'
import {
	captureSignalTouch,
	cookieConsent,
	notifyConsentChange,
	onConsentChange,
	rememberLanding,
	type SignalStream,
	setConsentContext,
	trackSignalPage,
} from '../lib/consent'
import { trackGa4KeyEvent } from '../lib/ga4-key-events'
import {
	createGoogleTag,
	deleteGoogleCookies,
	type GoogleTagController,
	googleTagIds,
	setActiveGoogleTag,
	type TagDocument,
	type TagWindow,
	trackablePath,
} from '../lib/google-tag'
import {
	createMetaPixel,
	type MetaPixelController,
	metaPixelId,
	type PixelDocument,
	type PixelWindow,
	setActiveMetaPixel,
} from '../lib/meta-pixel'
import { syncReferral } from '../lib/referral'

function publicDocumentTitle(path: string): string | null {
	const canonical = document.querySelector<HTMLLinkElement>('link[rel="canonical"]')
	if (!canonical?.href) return null
	// The canonical host can differ from the request host on a preview. Match
	// the path so the outgoing route's head cannot label the incoming view.
	const canonicalPath = new URL(canonical.href).pathname
	return canonicalPath.replace(/\/+$/, '') === path.replace(/\/+$/, '')
		? document.title.trim() || null
		: null
}

export function ConsentRuntime() {
	const location = useLocation()
	const isRouting = useIsRouting()
	let tag: GoogleTagController | null = null
	let pixel: MetaPixelController | null = null
	let signup: SignUpMethod | null = null
	// Read the landing URL once: consent may arrive after the SPA has navigated.
	const landing =
		typeof window === 'undefined'
			? null
			: { search: window.location.search, referrer: document.referrer }
	if (typeof window !== 'undefined') rememberLanding(window.location.href)
	function sync() {
		const routing = isRouting()
		const { pathname: path, search } = location
		const consent = cookieConsent()
		// Only public paths track page views. Tag initialization also supports the
		// explicit conversion on the subscription return page.
		const checkoutReturn =
			(consent.analytics || consent.marketing) &&
			/^(?:\/[^/]+)?\/settings\/subscription\/?$/.test(path) &&
			subscriptionReturn(new URLSearchParams(search)).session !== null
		const isPublic = trackablePath(path) !== null
		tag?.sync(!routing && (isPublic || checkoutReturn || signup !== null))
		if (!routing && consent.ready && signup) {
			const method = signup
			signup = null
			trackGa4KeyEvent('sign_up', { method })
		}
		if (!routing) tag?.pageView(path, isPublic ? publicDocumentTitle(path) : null)
		if (!routing && consent.ready) pixel?.pageView(isPublic ? path : null)
		if (!tag && !consent.analytics && (consent.ready || consent.gpc)) {
			deleteGoogleCookies(document, window.location.hostname)
		}
	}

	function capture() {
		if (isRouting() || typeof window === 'undefined') return
		const { pathname, search } = location
		const consent = cookieConsent()
		if (!consent.ready) return
		const touch = captureSignalTouch()
		trackSignalPage(trackablePath(pathname))
		syncEntrySurface(search, consent.analytics)
		syncReferral({ pathname, search, touch, granted: consent.analytics && consent.explicit })
	}

	createEffect(() => {
		capture()
		sync()
	})
	onMount(() => {
		// Auth sets this only after creating an account. Never replay it on a later opt-in.
		const method = consumeSignUpCookie(document)
		signup = method
		const stop = onConsentChange(() => {
			capture()
			sync()
		})
		// SolidStart may insert the new title and canonical link after the
		// location has committed. Recheck only after head content changes.
		const metadata = new MutationObserver(sync)
		metadata.observe(document.head, {
			subtree: true,
			childList: true,
			characterData: true,
			attributes: true,
			attributeFilter: ['href'],
		})
		const storageChanged = (event: StorageEvent) => {
			if (event.key === null || event.key === CONSENT_KEY) {
				notifyConsentChange()
			}
		}
		window.addEventListener('storage', storageChanged)
		const abort = new AbortController()
		void (async () => {
			try {
				const response = await fetch('/api/consent-context', {
					cache: 'no-store',
					credentials: 'omit',
					redirect: 'error',
					signal: AbortSignal.any([abort.signal, AbortSignal.timeout(5000)]),
				})
				if (!response.ok) return
				const data = await response.json()
				if (abort.signal.aborted || typeof data?.gpc !== 'boolean') return
				if (data.region !== 'ROW' && data.region !== 'EEA') return
				const region = data.region
				const ids = googleTagIds({
					GA_MEASUREMENT_ID: typeof data.ids?.ga === 'string' ? data.ids.ga : undefined,
					GOOGLE_ADS_ID: typeof data.ids?.ads === 'string' ? data.ids.ads : undefined,
					GOOGLE_ADS_PURCHASE_LABEL:
						typeof data.ids?.adsPurchaseLabel === 'string' ? data.ids.adsPurchaseLabel : undefined,
				})
				if (ids) {
					tag = createGoogleTag({
						ids,
						win: window as unknown as TagWindow,
						doc: document as unknown as TagDocument,
						consent: () => cookieConsent().signals,
						landing,
					})
					setActiveGoogleTag(tag)
				}
				const meta = metaPixelId({
					META_PIXEL_ID: typeof data.ids?.meta === 'string' ? data.ids.meta : undefined,
				})
				if (meta) {
					pixel = createMetaPixel({
						id: meta,
						win: window as unknown as PixelWindow,
						doc: document as unknown as PixelDocument,
					})
					setActiveMetaPixel(pixel)
				}
				setCheckoutMeasurementId(ids?.ga ?? null)
				const raw: Partial<SignalStream> | null = data.stream ?? null
				const stream =
					typeof raw?.apiKey === 'string' && typeof raw.baseUrl === 'string'
						? { apiKey: raw.apiKey, baseUrl: raw.baseUrl }
						: undefined
				setConsentContext({
					region,
					gpc: data.gpc,
					optOutMarket: data.optOutMarket === true,
					stream,
				})
			} catch {
				// If the HTTP privacy signal could not be read, leave measurement off.
			}
		})()
		onCleanup(() => {
			abort.abort()
			metadata.disconnect()
			stop()
			window.removeEventListener('storage', storageChanged)
			setActiveGoogleTag(null)
			setActiveMetaPixel(null)
			setConsentContext(null)
		})
	})
	return null
}
