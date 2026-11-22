import { useLocation } from '@solidjs/router'
import { createEffect, onCleanup } from 'solid-js'
import {
	canStoreMarketing,
	cookieConsent,
	hasAnalyticsConsent,
	onConsentChange,
} from '@/features/analytics/lib/consent'
import {
	ATTRIBUTION_SESSION_KEY,
	attributionCookieString,
	mergeSearchWithSession,
	nextAttributionCookie,
	nextSessionAttribution,
	readAttributionCookie,
	readSessionAttribution,
} from '@/lib/attribution'

/**
 * Preserves same-tab campaign attribution across sign-in. A durable
 * attribution cookie requires an explicit grant; GPC or decline clears both
 * stores. Ad click IDs are captured only with separate marketing consent.
 */
export function AttributionCapture() {
	const location = useLocation()
	createEffect(() => {
		const pathname = location.pathname
		const liveSearch = location.search
		const secure = window.location.protocol === 'https:'
		const sync = () => {
			let storage: Storage | undefined
			try {
				storage = window.sessionStorage
			} catch {
				// Blocked storage does not block navigation.
			}
			const consent = cookieConsent()
			if (!consent.ready && !consent.gpc) return
			const existingSession = readSessionAttribution(storage)
			const sessionAction = nextSessionAttribution({
				existing: existingSession,
				search: liveSearch,
				landingPath: pathname || window.location.pathname,
				analyticsDeclined:
					!consent.storageAvailable || consent.gpc || consent.status === 'declined',
				marketingDeclined: !consent.marketing,
			})
			let activeSession = existingSession
			try {
				if (sessionAction.kind === 'set') {
					storage?.setItem(ATTRIBUTION_SESSION_KEY, sessionAction.value)
					activeSession = sessionAction.value
				} else if (sessionAction.kind === 'clear') {
					storage?.removeItem(ATTRIBUTION_SESSION_KEY)
					activeSession = null
				}
			} catch {
				// sessionStorage may be unavailable in restricted contexts
			}

			const cookieAction = nextAttributionCookie({
				existing: readAttributionCookie(document.cookie),
				search: mergeSearchWithSession(liveSearch, activeSession),
				landingPath: pathname || window.location.pathname,
				now: Date.now(),
				analytics: hasAnalyticsConsent(),
				marketing: canStoreMarketing(),
			})
			if (cookieAction.kind === 'set') {
				// biome-ignore lint/suspicious/noDocumentCookie: first-party tag cookie, read by the api
				document.cookie = attributionCookieString(cookieAction.value, secure)
			} else if (cookieAction.kind === 'clear') {
				// biome-ignore lint/suspicious/noDocumentCookie: clearing the tag cookie on decline
				document.cookie = attributionCookieString(null, secure)
			}
		}
		sync()
		onCleanup(onConsentChange(sync))
	})

	return null
}
