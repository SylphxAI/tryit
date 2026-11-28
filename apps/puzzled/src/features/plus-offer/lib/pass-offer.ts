/**
 * The contextual pass offer: after the day's first finish and at the
 * free-pick limit. Pure rules; the Rust api still decides access and Money
 * owns the price. Fails closed: no live price, no offer.
 */

import { formatPrice, type PlanCard } from '@/lib/billing/plus'

export type PassOfferContext = 'first_finish' | 'pick_limit'

/** Existing checkout triggers, so attribution plumbing is unchanged. */
export const PASS_OFFER_TRIGGER: Record<PassOfferContext, string> = {
	first_finish: 'result_card',
	pick_limit: 'game_unlock',
}

/** The free way out, offered beside the pricing link with the same weight. */
export function passOfferExitKey(context: PassOfferContext): 'tomorrow' | 'free' {
	return context === 'pick_limit' ? 'tomorrow' : 'free'
}

export type PassOffer = {
	price: string
	days: number
}

/** The one-time pass in the visitor's catalogue currency, or null when it may not be offered. */
export function passOfferFor(cards: readonly PlanCard[] | null, locale: string): PassOffer | null {
	if (!cards) return null
	const pass = cards.find(
		(card) =>
			card.id === 'individual_once' &&
			!card.family &&
			card.interval === 'once' &&
			card.accessDays > 0 &&
			card.amountMinor > 0,
	)
	if (!pass) return null
	return {
		price: formatPrice(pass.amountMinor, pass.currency, locale),
		days: pass.accessDays,
	}
}

const KEY = 'puzzled.passOffer.'

type DayStore = Pick<Storage, 'getItem' | 'setItem'>

/** Once per context per server day key (`Asia/Hong_Kong`), never the browser clock. */
export function passOfferSeen(store: DayStore | null, context: PassOfferContext, dayKey: string) {
	try {
		return store?.getItem(KEY + context) === dayKey
	} catch {
		return false
	}
}

export function markPassOfferSeen(
	store: DayStore | null,
	context: PassOfferContext,
	dayKey: string,
) {
	try {
		store?.setItem(KEY + context, dayKey)
	} catch {
		// Private mode: the offer may show again, which is harmless.
	}
}
