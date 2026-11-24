import { expect, test } from 'bun:test'
import { homeOfferSchemas } from './home-offer-schemas'

test.each([
	['en-US', 'https://tryit.fun', 'https://tryit.fun/pricing', 'USD'],
	['en-GB', 'https://tryit.fun', 'https://tryit.fun/en-GB/pricing', 'GBP'],
	['zh-TW', 'https://preview.example', 'https://preview.example/zh-TW/pricing', 'TWD'],
])(
	'publishes the Tryit Plus product and localized offers on %s',
	(locale, origin, pricing, currency) => {
		const product = homeOfferSchemas(locale, origin).find((schema) => schema['@type'] === 'Product')
		expect(product).toMatchObject({
			'@type': 'Product',
			name: 'Tryit Plus',
			image: `${origin}/brand/tryit-plus.png`,
			url: pricing,
		})
		expect(product?.offers.length).toBeGreaterThan(0)
		for (const offer of product?.offers ?? []) {
			expect(offer).toMatchObject({ '@type': 'Offer', priceCurrency: currency, url: pricing })
			expect(Number(offer.price)).toBeGreaterThan(0)
		}
	},
)
