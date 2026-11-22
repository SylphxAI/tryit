import { useLocation } from '@solidjs/router'
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

export function ConsentRuntime() {
	const location = useLocation()
	let tag: GoogleTagController | null = null
	function sync(path: string, search: string) {
		const consent = cookieConsent()
		// Only public paths track page views. Tag initialization also supports the
		// explicit conversion on the subscription return page.
		const checkoutReturn =
			consent.status === 'accepted' &&
			/^(?:\/[^/]+)?\/settings\/subscription\/?$/.test(path) &&
			subscriptionReturn(new URLSearchParams(search)).session !== null
		tag?.sync(trackablePath(path) !== null || checkoutReturn)
		tag?.pageView(path)
		if (!tag && !consent.analytics && (consent.ready || consent.gpc)) {
			deleteGoogleCookies(document, window.location.hostname)
		}
	}

	createEffect(() => sync(location.pathname, location.search))
	onMount(() => {
		const stop = onConsentChange(() => sync(location.pathname, location.search))
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
			stop()
			window.removeEventListener('storage', storageChanged)
			setActiveGoogleTag(null)
		})
	})
	return null
}
