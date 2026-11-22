import { loadPricingPlans, selectPricingPlans } from '@/features/plus/lib/pricing-plans'
import { readBillingPlans } from '@/lib/api/request-billing'
import type { Locale } from '@/lib/i18n/config'
import { comparisonPricing } from '../components/comparison-pricing'

export async function readComparisonPricing(headers: Headers, locale: Locale) {
	const plans = await loadPricingPlans((timeoutMs) => readBillingPlans(headers, timeoutMs))
	const selected = selectPricingPlans(plans, headers, locale)
	return { locale, pricing: comparisonPricing(selected, locale, plans?.familyMaxMembers ?? 4) }
}
