import { isComparisonSlug } from '@/features/marketing/components/comparison-slugs'
import { PAYWALL_CHECKOUT_TRIGGERS } from '@/features/plus-offer/lib/plus-offer'

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

export const ENTRY_SURFACE_KEY = 'puzzled:attr:entry-surface'

export function syncEntrySurface(search: string, granted: boolean) {
	try {
		const storage = window.sessionStorage
		storage.removeItem('puzzled:attr:session') // Retired store could contain pre-consent tags.
		if (!granted) storage.removeItem(ENTRY_SURFACE_KEY)
		else if (!trustedEntrySurface(storage.getItem(ENTRY_SURFACE_KEY))) {
			const surface = trustedEntrySurface(new URLSearchParams(search).get('entry_surface'))
			if (surface) storage.setItem(ENTRY_SURFACE_KEY, surface)
		}
	} catch {
		// Optional analytics storage.
	}
}

export function checkoutEntrySurface(trigger?: unknown): string | undefined {
	try {
		const surface = trustedEntrySurface(window.sessionStorage.getItem(ENTRY_SURFACE_KEY))
		if (surface) return surface
	} catch {
		// No stored source.
	}
	return trustedCheckoutTrigger(trigger)
}
