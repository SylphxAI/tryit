import { hasAnalyticsConsent } from '@/features/analytics/lib/consent'
import {
	clearCheckoutQuote,
	type SettledPurchase,
	trackCheckoutPurchase,
	trackCheckoutTrialStart,
} from '@/features/analytics/lib/google-tag'
import { trackMetaPurchase } from '@/features/analytics/lib/meta-pixel'
import { trackPurchaseStage } from '@/features/analytics/lib/signal-stages'

/** Report browser attribution without writing or replacing the Money purchase record. */
export function reportCheckoutReturn(receipt: SettledPurchase, legacySessionId?: string | null) {
	trackCheckoutPurchase(receipt, legacySessionId)
	void trackPurchaseStage(receipt)
	trackMetaPurchase(receipt)
	clearCheckoutQuote()
}

/** Separate from Ads purchase attribution; a trial never represents a charge. */
export function reportCheckoutTrial(sessionId: string) {
	if (hasAnalyticsConsent()) trackCheckoutTrialStart({ sessionId })
}
