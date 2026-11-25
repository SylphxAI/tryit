import { expect, test } from 'bun:test'
import { create } from '@bufbuild/protobuf'
import { Code, ConnectError } from '@connectrpc/connect'
import { ListPlansResponseSchema } from '@/gen/connect/puzzled/v1/billing_pb'
import {
	individualUnlockPlans,
	loadPricingPlans,
	pricingPlanState,
	selectPricingPlans,
} from './pricing-plans'

const state = async (read: () => Promise<{ salesOpen: boolean }>) =>
	pricingPlanState(await loadPricingPlans(read, 15, 1), 0)

test('a rejected listPlans retries once and shows unavailable, never closed', async () => {
	let calls = 0
	expect(
		await state(async () => {
			calls++
			throw new ConnectError('rolling over', Code.Unavailable)
		}),
	).toBe('unavailable')
	expect(calls).toBe(2)
})

test('a timed-out listPlans never selects closed copy', async () => {
	expect(await state(() => new Promise(() => {}))).toBe('unavailable')
})

test('explicit closure alone selects closed copy and does not retry', async () => {
	let calls = 0
	expect(
		await state(async () => {
			calls++
			return { salesOpen: false }
		}),
	).toBe('closed')
	expect(calls).toBe(1)
	expect(pricingPlanState({ salesOpen: true }, 0)).toBe('unavailable')
})

test('a retry can recover the open catalogue', async () => {
	let calls = 0
	const plans = await loadPricingPlans(
		async () => {
			if (++calls === 1) throw new ConnectError('not ready', Code.Unavailable)
			return { salesOpen: true }
		},
		15,
		1,
	)
	expect(pricingPlanState(plans, 1)).toBe('open')
})

const fixture = create(ListPlansResponseSchema, {
	salesOpen: true,
	plans: [
		{ id: 'individual_monthly', interval: 'month', prices: [price('usd', 500), price('jpy', 800)] },
		{
			id: 'family_yearly',
			interval: 'year',
			family: true,
			prices: [price('usd', 9600), price('jpy', 10389)],
		},
		{ id: 'individual_once', accessDays: 3, prices: [price('usd', 299), price('jpy', 479)] },
		{ id: 'individual_yearly', interval: 'year', prices: [price('usd', 3999), price('jpy', 7200)] },
	],
})

function price(currency: string, amount: number) {
	return { currency, unitAmountMinor: BigInt(amount) }
}

test.each([
	['usd', 33],
	['jpy', 25],
] as const)(
	'fourth-game lock orders the same %s cards yearly, pass, monthly',
	(currency, saving) => {
		const headers = new Headers({ cookie: `puzzled_currency=${currency}`, 'CF-IPCountry': 'GB' })
		const pricing = selectPricingPlans(fixture, headers, 'en-GB')
		expect(pricing.currency).toBe(currency)
		const unlock = individualUnlockPlans(pricing.cards)
		expect(unlock.map((card) => card.id)).toEqual([
			'individual_yearly',
			'individual_once',
			'individual_monthly',
		])
		expect(unlock.map((card) => card.currency)).toEqual([currency, currency, currency])
		expect(unlock.map((card) => card.savingPercent)).toEqual([saving, null, null])
	},
)

test('never compares annual and monthly amounts across a currency fallback', () => {
	const cards = selectPricingPlans(fixture, new Headers({ 'CF-IPCountry': 'JP' }), 'en-US').cards
	const mixed = cards.map((card) =>
		card.id === 'individual_monthly' ? { ...card, amountMinor: 500, currency: 'usd' } : card,
	)
	expect(individualUnlockPlans(mixed)[0]?.savingPercent).toBeNull()
	expect(
		individualUnlockPlans(cards.filter((card) => card.interval !== 'year')).map((c) => c.id),
	).toEqual(['individual_once', 'individual_monthly'])
})
