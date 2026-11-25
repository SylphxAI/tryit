import { hasAnalyticsConsent } from '@/features/analytics/lib/consent'
import {
	clearCheckoutQuote,
	trackCheckoutPurchase,
	trackCheckoutTrialStart,
} from '@/features/analytics/lib/google-tag'

/** Report browser attribution without writing or replacing the Money purchase record. */
export function reportCheckoutReturn({
	sessionId,
	status,
}: {
	sessionId: string
	status: 'trialing' | 'paid'
}) {
	if (status === 'trialing') {
		if (hasAnalyticsConsent()) trackCheckoutTrialStart({ sessionId })
		return
	}
	if (!trackCheckoutPurchase({ sessionId })) clearCheckoutQuote()
}
