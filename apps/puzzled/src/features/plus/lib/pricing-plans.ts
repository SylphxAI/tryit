import { Code, ConnectError } from '@connectrpc/connect'
import { parseCookie } from 'cookie-es'
import type { ListPlansResponse } from '@/gen/connect/puzzled/v1/billing_pb'
import {
	availableCurrencies,
	COUNTRY_HEADER,
	CURRENCY_COOKIE,
	chooseCurrency,
} from '@/lib/billing/currency'
import { type PlanCard, planCards } from '@/lib/billing/plus'
import { withPresentationDeadline } from '@/lib/presentation-document'
import { pricingYearlySaving } from './pricing-display'

const transientCodes = new Set([
	Code.Unknown,
	Code.Canceled,
	Code.DeadlineExceeded,
	Code.Unavailable,
	Code.Internal,
	Code.ResourceExhausted,
])
const permanentFailure = Symbol('permanent billing failure')

// Pricing is not the readiness document. Give it two bounded attempts;
// leave the one-second default on the home route and on all other reads.
export async function loadPricingPlans<T extends { salesOpen: boolean }>(
	read: (timeoutMs: number) => Promise<T>,
	attemptMs = 1900,
	retryDelayMs = 100,
): Promise<T | null> {
	const attempt = () =>
		withPresentationDeadline(
			Promise.resolve()
				.then(() => read(attemptMs))
				.catch((error: unknown) =>
					transientCodes.has(ConnectError.from(error).code) ? null : permanentFailure,
				),
			null,
			attemptMs,
		)
	let plans = await attempt()
	if (plans === null) {
		await new Promise((resolve) => setTimeout(resolve, retryDelayMs))
		plans = await attempt()
	}
	return plans === permanentFailure ? null : plans
}

export type PricingPlanState = 'closed' | 'unavailable' | 'open'

export function pricingPlanState(
	plans: { salesOpen: boolean } | null,
	cardCount: number,
): PricingPlanState {
	if (plans?.salesOpen === false) return 'closed'
	if (!plans || cardCount === 0) return 'unavailable'
	return 'open'
}

/** The fourth-game lock uses the same cards as pricing, with yearly as the anchor. */
export function individualUnlockPlans(cards: readonly PlanCard[]) {
	const individual = cards.filter((card) => !card.family)
	const monthly = individual.find((card) => card.interval === 'month')
	const yearly = individual.find((card) => card.interval === 'year')
	const pass = individual.find((card) => card.interval === 'once')
	return [yearly, pass, monthly]
		.filter((card) => card !== undefined)
		.map((card) => ({
			...card,
			savingPercent: card.interval === 'year' ? pricingYearlySaving(monthly, yearly) : null,
		}))
}

/** Pricing and comparisons resolve the catalogue against the same request preference. */
export function selectPricingPlans(
	plans: ListPlansResponse | null,
	headers: Headers,
	locale: string,
) {
	const currencies = plans?.salesOpen ? availableCurrencies(plans.plans) : []
	const currency = chooseCurrency({
		cookie: parseCookie(headers.get('cookie') ?? '')[CURRENCY_COOKIE],
		country: headers.get(COUNTRY_HEADER),
		acceptLanguage: headers.get('accept-language'),
		locale,
		available: currencies,
	})
	const cards = plans?.salesOpen ? planCards(plans.plans, currency) : []
	const planState = pricingPlanState(plans, cards.length)
	return { currencies, currency, cards, planState }
}
