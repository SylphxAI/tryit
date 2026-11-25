import { minorUnitsToMajor, type PlanCard } from '@/lib/billing/plus'
import type { Translate } from '@/lib/i18n/translate'
import type { PageMetadata } from '@/lib/seo/page-metadata'
import type { PricingPlanState } from './pricing-plans'

export function pricingBuyerFaq(
	t: Translate,
	facts: { gameCount: number; archiveDays: number; passDays: number; familyMax: number },
) {
	const pass = { count: facts.gameCount, days: facts.archiveDays, passDays: facts.passDays }
	const values = { pass, cancel: {}, ads: {}, family: { count: facts.familyMax } }
	return {
		title: t('plus.pricing.faq.title'),
		items: (['pass', 'cancel', 'ads', 'family'] as const).map((id) => ({
			question: t(`plus.pricing.faq.${id}.question`, values[id]),
			answer: t(`plus.pricing.faq.${id}.answer`, values[id]),
		})),
	}
}

export function pricingProductJsonLd(
	t: Translate,
	meta: PageMetadata,
	planState: PricingPlanState,
	cards: readonly PlanCard[],
) {
	if (planState !== 'open') return null
	const url = meta.alternates.canonical
	return {
		'@context': 'https://schema.org',
		'@type': 'Product',
		name: 'Tryit Plus',
		brand: { '@type': 'Brand', name: 'Tryit' },
		url,
		image: meta.openGraph.images[0]?.url,
		offers: cards.map((card) => ({
			'@type': 'Offer',
			name:
				card.interval === 'once'
					? t('plus.pricing.weekendPass', { days: card.accessDays })
					: t(`plus.subscription.plan.${card.id}`),
			price: minorUnitsToMajor(card.amountMinor, card.currency).toFixed(2),
			priceCurrency: card.currency.toUpperCase(),
			availability: 'https://schema.org/InStock',
			url: `${url}?${new URLSearchParams({ plan: card.id })}#${card.family ? 'family' : 'plus'}`,
		})),
	}
}
