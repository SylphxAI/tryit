import { getRequestEvent } from 'solid-js/web'
import { readUnlockPrices } from '@/features/daily/solid/unlock-prices'
import { passOfferFor } from '@/features/plus-offer/lib/pass-offer'
import type { Locale } from '@/lib/i18n/config'

export async function readPassOffer(locale: Locale) {
	'use server'
	const event = getRequestEvent()
	if (!event) return null
	event.response.headers.set('Cache-Control', 'private, no-store')
	const { headers } = event.request
	const { parseCookie } = await import('cookie-es')
	const { hasGuestProgressCookie } = await import('@/lib/api/request-connect')
	const { CHECKOUT_CLAIM_COOKIE } = await import('@/lib/billing/checkout-claim-cookie')
	const { SESSION_COOKIE_NAMES } = await import('@/lib/identity/session-cookie')
	const cookies = parseCookie(headers.get('cookie') ?? '')
	// Presentation only: an existing guest play credential and no account or
	// claim candidate. This proves neither entitlement nor payment history.
	if (
		!hasGuestProgressCookie(headers) ||
		headers.has('authorization') ||
		Object.keys(cookies).some(
			(name) =>
				name === CHECKOUT_CLAIM_COOKIE ||
				SESSION_COOKIE_NAMES.some((session) => session === name) ||
				(name.startsWith('__sylphx_') && name.endsWith('_session')),
		)
	)
		return null
	const { cards } = await readUnlockPrices(locale)
	return passOfferFor(cards, locale)
}
