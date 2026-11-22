import { expect, test } from 'bun:test'
import { Code, ConnectError } from '@connectrpc/connect'
import { loadPricingPlans, pricingPlanState } from './pricing-plans'

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
