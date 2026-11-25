import { expect, test } from 'bun:test'
import type { PlanCard } from '@/lib/billing/plus'
import { locales } from '@/lib/i18n/config'
import { createTranslator } from '@/lib/i18n/translate'
import { pageMetadata } from '@/lib/seo/page-metadata'
import { formatFamilyMonthlyPerPerson } from './pricing-display'
import { pricingBuyerFaq, pricingProductJsonLd } from './pricing-structured-data'

const meta = pageMetadata({
	locale: 'en-GB',
	path: '/pricing',
	baseUrl: 'https://tryit.fun',
	title: 'Every game, every day',
	description: 'Tryit Plus opens every game',
	imagePath: '/og?title=Tryit+Plus',
})
const t = createTranslator('en-GB')
const defaults = { currency: 'gbp', trialDays: 0, accessDays: 0, family: false } as const
const familyYear: PlanCard = {
	...defaults,
	id: 'family_yearly',
	interval: 'year',
	family: true,
	amountMinor: 7199,
}
const cards: PlanCard[] = [
	{ ...defaults, id: 'individual_once', interval: 'once', amountMinor: 199, accessDays: 3 },
	{ ...defaults, id: 'individual_monthly', interval: 'month', amountMinor: 499 },
	{ ...defaults, id: 'individual_yearly', interval: 'year', amountMinor: 3900 },
	{ ...defaults, id: 'family_monthly', interval: 'month', family: true, amountMinor: 799 },
	familyYear,
]

test('Product links to the page and advertises exactly the live open plans', () => {
	const url = 'https://tryit.fun/en-GB/pricing'
	const product = pricingProductJsonLd(t, meta, 'open', cards)
	expect(product).toEqual({
		'@context': 'https://schema.org',
		'@type': 'Product',
		name: 'Tryit Plus',
		brand: { '@type': 'Brand', name: 'Tryit' },
		url,
		image: 'https://tryit.fun/og?title=Tryit+Plus',
		offers: [
			['3-day pass', '1.99', 'individual_once#plus'],
			['Tryit Plus, monthly', '4.99', 'individual_monthly#plus'],
			['Tryit Plus, yearly', '39.00', 'individual_yearly#plus'],
			['Tryit Family, monthly', '7.99', 'family_monthly#family'],
			['Tryit Family, yearly', '71.99', 'family_yearly#family'],
		].map(([name, price, target]) => ({
			'@type': 'Offer',
			name,
			price,
			priceCurrency: 'GBP',
			availability: 'https://schema.org/InStock',
			url: `${url}?plan=${target}`,
		})),
	})
	for (const state of ['closed', 'unavailable'] as const)
		expect(pricingProductJsonLd(t, meta, state, cards)).toBeNull()
})

test('Offer prices use the card’s own currency; yen already arrive in whole units', () => {
	const yen = { ...familyYear, amountMinor: 10389, currency: 'jpy' }
	const product = pricingProductJsonLd(t, meta, 'open', [yen])
	expect(product?.offers).toHaveLength(1)
	expect(product?.offers[0]).toMatchObject({ price: '10389.00', priceCurrency: 'JPY' })
})

test('Family Yearly divides the total by 12 months and the seat count before rounding', () => {
	expect(formatFamilyMonthlyPerPerson(familyYear, 4, 'en-GB')).toBe('£1.50')
	expect(formatFamilyMonthlyPerPerson(familyYear, 3, 'en-GB')).toBe('£2')
	expect(
		formatFamilyMonthlyPerPerson({ ...familyYear, amountMinor: 10389, currency: 'jpy' }, 4, 'ja'),
	).toBe('￥216')
})

test.each(locales)('four buyer questions and answers resolve from live terms in %s', (locale) => {
	const { items, title } = pricingBuyerFaq(createTranslator(locale), {
		gameCount: 19,
		archiveDays: 30,
		passDays: 3,
		familyMax: 4,
	})
	expect(items).toHaveLength(4)
	const [pass, , , family] = items
	for (const text of [title, ...items.flatMap(({ question, answer }) => [question, answer])]) {
		expect(text).not.toMatch(/plus\.pricing\.|[{}]|Sylphx/)
		expect(text).not.toBe('')
	}
	expect(pass?.answer).toContain('19')
	expect(pass?.answer).toContain('30')
	expect(family?.answer).toContain('4')
})
