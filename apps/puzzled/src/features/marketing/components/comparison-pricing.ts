import type { selectPricingPlans } from '@/features/plus/lib/pricing-plans'
import { getAllGameMetadata } from '@/games/registry'
import { formatPrice, minorUnitsToMajor, type PlanId } from '@/lib/billing/plus'
import type { ComparisonPricingRow, ComparisonSpec } from './comparison-specs'
import type { UseCaseOffer } from './use-case-specs'

const PLAN_LABELS: Record<PlanId, { name: string; term: string; group: ComparisonPricingRow }> = {
	individual_once: { name: '3-Day Pass', term: 'once', group: 'pass' },
	individual_monthly: { name: 'Tryit Plus', term: 'per month', group: 'subscriptions' },
	individual_yearly: { name: 'Tryit Plus', term: 'per year', group: 'subscriptions' },
	family_monthly: { name: 'Tryit Family', term: 'per month', group: 'subscriptions' },
	family_yearly: { name: 'Tryit Family', term: 'per year', group: 'subscriptions' },
}

const gameCount = getAllGameMetadata().length

export function comparisonPricing(
	plans: ReturnType<typeof selectPricingPlans>,
	locale: string,
	familyMax: number,
) {
	const { currency, currencies, cards, planState } = plans
	const prices = cards.flatMap((card) => {
		const label = Object.hasOwn(PLAN_LABELS, card.id) ? PLAN_LABELS[card.id] : undefined
		if (!label || card.currency !== currency) return []
		return [
			{
				...label,
				text: formatPrice(card.amountMinor, currency, locale),
				major: minorUnitsToMajor(card.amountMinor, currency),
			},
		]
	})
	const priceCurrency = currency.toUpperCase()
	const pass = prices.find((price) => price.group === 'pass')
	const subscription = (name: string) =>
		prices
			.filter((price) => price.group === 'subscriptions' && price.name === name)
			.map((price) => `${price.text} ${price.term}`)
			.join(' or ')
	const plus = subscription('Tryit Plus')
	const family = subscription('Tryit Family')
	const unavailable =
		planState === 'closed'
			? 'Paid plans are not currently on sale.'
			: 'Current Tryit prices are unavailable. Check the pricing page for availability.'
	const rows: Record<ComparisonPricingRow, string> = {
		pass: pass
			? `${pass.name}: ${pass.text} once, no renewal. All ${gameCount} games and every past day.`
			: prices.length
				? 'The 3-Day Pass is not currently listed.'
				: unavailable,
		subscriptions:
			[
				plus && `Tryit Plus: ${plus}.`,
				family && `Tryit Family (up to ${familyMax} people): ${family}.`,
			]
				.filter(Boolean)
				.join(' ') || (prices.length ? 'Subscriptions are not currently listed.' : unavailable),
	}
	const summary = `Tryit's 3 daily picks are free. ${
		prices.length
			? [
					pass && rows.pass,
					(plus || family) && rows.subscriptions,
					`Tryit prices are in ${priceCurrency}, VAT included.`,
				]
					.filter(Boolean)
					.join(' ')
			: unavailable
	}`
	const offers: UseCaseOffer[] = prices.length
		? [
				{ name: 'Free (any 3 games a day)', price: '0', priceCurrency },
				...prices.map((price) => ({
					name: price.group === 'pass' ? price.name : `${price.name} (${price.term})`,
					price: String(price.major),
					priceCurrency,
				})),
			]
		: []
	return {
		rows,
		summary,
		offers,
		currency,
		currencies: prices.length ? currencies : [],
		note: prices.length
			? `Tryit prices are in ${priceCurrency} and include VAT. Other publishers' prices aren't converted.`
			: undefined,
	}
}

export function comparisonPricingFaqs(spec: ComparisonSpec, pricing: { summary: string }) {
	return spec.faqs.map((item) =>
		item.withTryitPricing ? { ...item, answer: `${item.answer} ${pricing.summary}` } : item,
	)
}
