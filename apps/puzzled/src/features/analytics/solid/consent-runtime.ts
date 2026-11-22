import { useIsRouting, useLocation } from '@solidjs/router'
import { createEffect, onCleanup, onMount } from 'solid-js'
import { subscriptionReturn } from '@/features/settings/solid/subscription-return'
import { CONSENT_KEY, MARKETING_CONSENT_KEY } from '@/lib/storage-keys'
import {
	cookieConsent,
	notifyConsentChange,
	onConsentChange,
	setConsentContext,
} from '../lib/consent'
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
	function sync() {
		const routing = isRouting()
		const { pathname: path, search } = location
		const consent = cookieConsent()
		// Only public paths track page views. Tag initialization also supports the
		// explicit conversion on the subscription return page.
		const checkoutReturn =
			consent.status === 'accepted' &&
			/^(?:\/[^/]+)?\/settings\/subscription\/?$/.test(path) &&
			subscriptionReturn(new URLSearchParams(search)).session !== null
		const isPublic = trackablePath(path) !== null
		tag?.sync(!routing && (isPublic || checkoutReturn))
		if (!routing) tag?.pageView(path, isPublic ? publicDocumentTitle(path) : null)
		if (!tag && !consent.analytics && (consent.ready || consent.gpc)) {
			deleteGoogleCookies(document, window.location.hostname)
		}
	}

	createEffect(sync)
	onMount(() => {
		const stop = onConsentChange(sync)
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
			if (event.key === null || event.key === CONSENT_KEY || event.key === MARKETING_CONSENT_KEY) {
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
				const region = data.region === 'non-eea' ? 'non-eea' : 'eea'
				const ids = googleTagIds({
					GA_MEASUREMENT_ID: typeof data.ids?.ga === 'string' ? data.ids.ga : undefined,
					GOOGLE_ADS_ID: typeof data.ids?.ads === 'string' ? data.ids.ads : undefined,
				})
				if (ids) {
					tag = createGoogleTag({
						ids,
						win: window as unknown as TagWindow,
						doc: document as unknown as TagDocument,
						consent: cookieConsent,
						defaultAnalytics: () => region === 'non-eea' && cookieConsent().status === 'pending',
					})
					setActiveGoogleTag(tag)
				}
				setConsentContext({ region, gpc: data.gpc })
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
		})
	})
	return null
}
