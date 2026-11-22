import { isComparisonSlug } from '@/features/marketing/components/comparison-slugs'
import { PAYWALL_CHECKOUT_TRIGGERS } from '@/features/plus-offer/lib/plus-offer'
import { readSessionEntrySurface } from '@/lib/attribution'

export function trustedCheckoutTrigger(value: unknown): string | undefined {
	if (typeof value !== 'string') return undefined
	if (value === 'pricing_subscribe' || PAYWALL_CHECKOUT_TRIGGERS.has(value)) return value
}

export function trustedEntrySurface(value: unknown): string | undefined {
	if (typeof value !== 'string' || !/^[A-Za-z0-9_-]{1,100}$/.test(value)) return undefined
	if (trustedCheckoutTrigger(value)) return value
	if (value.startsWith('seo_vs-') && isComparisonSlug(value.slice('seo_vs-'.length))) return value
	if (
		value === 'seo_vs-hub' ||
		value === 'seo_daily-word-and-logic-puzzles-online' ||
		value === 'seo_family-brain-games-no-ads'
	)
		return value
}

export function checkoutEntrySurface(
	trigger: string | undefined,
	storage: Pick<Storage, 'getItem'> | null,
): string | undefined {
	return trustedEntrySurface(readSessionEntrySurface(storage)) ?? trustedCheckoutTrigger(trigger)
}
