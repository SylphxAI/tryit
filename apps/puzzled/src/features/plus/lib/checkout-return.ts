import { hasAnalyticsConsent } from '@/features/analytics/lib/consent'
import {
	clearCheckoutQuote,
	type SettledPurchase,
	trackCheckoutPurchase,
	trackCheckoutTrialStart,
} from '@/features/analytics/lib/google-tag'

/** Report browser attribution without writing or replacing the Money purchase record. */
export function reportCheckoutReturn(receipt: SettledPurchase, legacySessionId?: string | null) {
	trackCheckoutPurchase(receipt, legacySessionId)
	clearCheckoutQuote()
}

/** Separate from Ads purchase attribution; a trial never represents a charge. */
export function reportCheckoutTrial(sessionId: string) {
	if (hasAnalyticsConsent()) trackCheckoutTrialStart({ sessionId })
}
