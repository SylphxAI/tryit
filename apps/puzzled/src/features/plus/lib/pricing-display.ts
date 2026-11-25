import {
	formatMonthlyEquivalentPrice,
	type PlanCard,
	yearlySavingPercent,
} from '@/lib/billing/plus'

export function pricingYearlySaving(monthly?: PlanCard, yearly?: PlanCard) {
	// A plan may fall back to USD when the resolved currency has no price for it.
	if (!monthly || !yearly || monthly.currency !== yearly.currency) return null
	return yearlySavingPercent(monthly.amountMinor, yearly.amountMinor)
}

export function formatFamilyMonthlyPerPerson(yearly: PlanCard, familyMax: number, locale: string) {
	return formatMonthlyEquivalentPrice(yearly.amountMinor / familyMax, yearly.currency, locale)
}
