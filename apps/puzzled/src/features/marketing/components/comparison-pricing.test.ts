import { expect, test } from 'bun:test'
import { create } from '@bufbuild/protobuf'
import { selectPricingPlans } from '@/features/plus/lib/pricing-plans'
import { ListPlansResponseSchema } from '@/gen/connect/puzzled/v1/billing_pb'
import { comparisonPricing } from './comparison-pricing'

test('closed and unavailable catalogues never advertise prices or a selector', () => {
	const headers = new Headers({ cookie: 'puzzled_currency=jpy', 'cf-ipcountry': 'HK' })
	const closed = create(ListPlansResponseSchema, {
		salesOpen: false,
		plans: [{ id: 'individual_once', prices: [{ currency: 'jpy', unitAmountMinor: 479n }] }],
	})
	const closedPricing = comparisonPricing(selectPricingPlans(closed, headers, 'en-US'), 'en-US', 4)
	expect(closedPricing.rows.pass).toBe('Paid plans are not currently on sale.')
	const unavailable = comparisonPricing(selectPricingPlans(null, headers, 'en-US'), 'en-US', 4)
	expect(unavailable.rows.pass).toContain('Current Tryit prices are unavailable.')
	for (const pricing of [closedPricing, unavailable]) {
		expect(pricing.offers).toEqual([])
		expect(pricing.currencies).toEqual([])
		expect(pricing.note).toBeUndefined()
	}
})
