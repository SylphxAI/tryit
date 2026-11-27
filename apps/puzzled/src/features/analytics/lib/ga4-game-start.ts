import { gamePath, PLAYER_TITLE } from '@/lib/game-slug'
import { cookieConsent, onConsentChange } from './consent'
import { sendGa4Event } from './google-tag'

/** Custom GA4 funnel event, not an Ads conversion or GA4 key event. */
export function trackGa4GameStart(
	slug: string,
	mode: 'daily' | 'archive',
): (() => void) | undefined {
	if (typeof window === 'undefined' || !Object.hasOwn(PLAYER_TITLE, slug)) return
	const consent = cookieConsent()
	if (!consent.explicit || consent.gpc) return
	const send = () => {
		// Don't inherit the tag's first page view context, which can contain click IDs.
		sendGa4Event('game_start', {
			game_slug: slug,
			mode,
			page_location: `${window.location.origin}${gamePath(slug)}`,
			page_referrer: '',
		})
	}
	if (consent.ready) {
		if (consent.analytics) send()
		return
	}
	// An SSR board can paint before consent context loads. Only wait if the
	// saved grant already existed at first observation, never for a new choice.
	let cancelled = false
	const stop = onConsentChange(() => {
		stop()
		const current = cookieConsent()
		// Failure or a choice change before initialization cancels the attempt.
		if (!current.ready || !current.explicit || !current.analytics || current.gpc) return
		// Let ConsentRuntime finish synchronizing the tag in this notification.
		queueMicrotask(() => {
			const live = cookieConsent()
			if (!cancelled && live.ready && live.explicit && live.analytics && !live.gpc) send()
		})
	})
	return () => {
		cancelled = true
		stop()
	}
}
