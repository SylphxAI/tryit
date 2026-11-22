import { CHECKOUT_QUOTE_KEY, hasAnalyticsConsent } from '@/features/analytics/lib/consent'
import { trackCheckoutTrialStart } from '@/features/analytics/lib/google-tag'

/** Money and Events own paid purchases. Preserve only the browser trial signal. */
export function reportCheckoutReturn({
	sessionId,
	status,
	userId,
}: {
	sessionId: string
	status: 'trialing' | 'paid'
	userId?: string
}) {
	if (!hasAnalyticsConsent()) return
	if (status === 'trialing') {
		trackCheckoutTrialStart({ sessionId, userId })
		return
	}
	try {
		window.localStorage.removeItem(CHECKOUT_QUOTE_KEY)
	} catch {
		// Ignore blocked storage.
	}
}
