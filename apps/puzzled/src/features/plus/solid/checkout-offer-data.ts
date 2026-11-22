import { parseCookie } from 'cookie-es'
import type { ListPlansResponse } from '@/gen/connect/puzzled/v1/billing_pb'
import {
	COUNTRY_HEADER,
	CURRENCY_COOKIE,
	chooseCurrency,
	offeredCurrencies,
} from '@/lib/billing/currency'
import { planCards } from '@/lib/billing/plus'
import type { Locale } from '@/lib/i18n/config'

export function buildCheckoutOffer(
	locale: Locale,
	headers: Headers,
	plans: ListPlansResponse | null,
) {
	const individual = plans?.salesOpen
		? plans.plans.filter(
				(plan) =>
					!plan.family &&
					plan.prices.length > 0 &&
					((plan.id === 'individual_once' && plan.interval === '' && plan.accessDays > 0) ||
						(plan.id === 'individual_yearly' && plan.interval === 'year') ||
						(plan.id === 'individual_monthly' && plan.interval === 'month')),
			)
		: []
	const currencies = offeredCurrencies(individual)
	const currency = chooseCurrency({
		cookie: parseCookie(headers.get('cookie') ?? '')[CURRENCY_COOKIE],
		country: headers.get(COUNTRY_HEADER),
		locale,
		available: currencies,
	})
	// A missing price must not hide other plans or silently change the charge currency.
	const cards = planCards(individual, currency).filter((card) => card.currency === currency)
	return { currencies, currency, cards }
}

export type CheckoutOfferData = ReturnType<typeof buildCheckoutOffer>
