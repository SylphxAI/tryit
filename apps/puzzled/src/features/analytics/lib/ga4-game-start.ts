import { gamePath, PLAYER_TITLE } from '@/lib/game-slug'
import { cookieConsent, onConsentChange } from './consent'
import { sendGa4Event } from './google-tag'

/** Custom GA4 funnel event, not an Ads conversion or GA4 key event. */
export function trackGa4GameStart(
	slug: string,
	mode: 'daily' | 'archive',
): (() => void) | undefined {
	if (typeof window === 'undefined' || !Object.hasOwn(PLAYER_TITLE, slug)) return
	const initial = cookieConsent()
	if (initial.gpc || (!initial.explicit && !initial.unanswered)) return
	const allowsStart = (consent: ReturnType<typeof cookieConsent>) =>
		consent.ready &&
		consent.analytics &&
		!consent.gpc &&
		(initial.explicit ? consent.explicit : consent.unanswered && consent.optOutMarket)
	const send = () => {
		// Don't inherit the tag's first page view context, which can contain click IDs.
		sendGa4Event('game_start', {
			game_slug: slug,
			mode,
			page_location: `${window.location.origin}${gamePath(slug)}`,
			page_referrer: '',
		})
	}
	if (initial.ready) {
		if (allowsStart(initial)) send()
		return
	}
	// An SSR board can paint before consent context loads. Resolve the policy
	// for the choice state at first observation; a later opt-in can't backfill.
	let cancelled = false
	const stop = onConsentChange(() => {
		stop()
		// Failure or a choice change before initialization cancels the attempt.
		if (!allowsStart(cookieConsent())) return
		// Let ConsentRuntime finish synchronizing the tag in this notification.
		queueMicrotask(() => {
			if (!cancelled && allowsStart(cookieConsent())) send()
		})
	})
	return () => {
		cancelled = true
		stop()
	}
}
