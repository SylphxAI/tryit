import { trackBehavioralEvent } from '@/features/analytics/lib/behavioral-events'
import { currencyForLocale } from '@/lib/billing/plus'
import type { Locale } from '@/lib/i18n/config'
import { localizedPath } from '@/lib/seo/urls'
import { PRACTICE_UPSELL } from './practice'

export function practicePricingHref(locale: Locale) {
	return localizedPath(locale, `/pricing?trigger=${PRACTICE_UPSELL}`)
}

/** One impression per mounted card, after the authoritative pick count arrives. */
export function practiceImpression(gameSlug: string, locale: Locale, isGuest: boolean) {
	let reported = false
	return (picksUsed: number | undefined, currency?: string) => {
		if (reported || picksUsed === undefined) return
		reported = true
		trackBehavioralEvent({
			event: 'paywall_hit',
			surface: PRACTICE_UPSELL,
			game_slug: gameSlug,
			picks_used: picksUsed,
			currency: currency ?? currencyForLocale(locale),
			is_guest: isGuest,
		})
	}
}
