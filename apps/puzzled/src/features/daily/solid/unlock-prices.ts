import { getRequestEvent } from 'solid-js/web'
import type { Locale } from '@/lib/i18n/config'

export async function readUnlockPrices(locale: Locale) {
	'use server'
	const event = getRequestEvent()
	if (!event) return { cards: [], currency: undefined }
	event.response.headers.set('Cache-Control', 'private, no-store')
	const { headers } = event.request
	const { readBillingPlans } = await import('@/lib/api/request-billing')
	const { individualUnlockPlans, loadPricingPlans, selectPricingPlans } = await import(
		'@/features/plus/lib/pricing-plans'
	)
	const plans = await loadPricingPlans((timeoutMs) => readBillingPlans(headers, timeoutMs))
	const { cards } = selectPricingPlans(plans, headers, locale)
	return {
		cards: individualUnlockPlans(cards),
		currency: cards.find((card) => !card.family)?.currency,
	}
}
