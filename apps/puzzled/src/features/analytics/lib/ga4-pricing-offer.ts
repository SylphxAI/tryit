import type { PlanId } from '@/lib/billing/plus'
import { hasAnalyticsConsent } from './consent'
import { sendGa4Event, trackablePath } from './google-tag'

const plans = [
	'individual_monthly',
	'individual_yearly',
	'individual_once',
	'family_monthly',
	'family_yearly',
] as const satisfies readonly PlanId[]

/** Pricing engagement is GA4-only, not a checkout result or an Ads conversion. */
export function trackGa4PricingOffer(event: 'plus_view' | 'upgrade_cta_click', plan: string): void {
	if (typeof window === 'undefined' || !hasAnalyticsConsent()) return
	if (!plans.some((allowed) => allowed === plan)) return
	if (trackablePath(window.location.pathname) !== '/pricing') return
	try {
		sendGa4Event(event, {
			placement: 'pricing',
			plan,
			page_location: `${window.location.origin}/pricing`,
			page_referrer: '',
		})
	} catch {
		// Measurement must not interrupt a checkout activation.
	}
}
