import { describe, expect, test } from 'bun:test'
import type { PlanCard } from '@/lib/billing/plus'
import en from '@/messages/en-US/plus.json'
import { markPassOfferSeen, passOfferExitKey, passOfferFor, passOfferSeen } from './pass-offer'

const card = (over: Partial<PlanCard>): PlanCard =>
	({
		id: 'individual_once',
		family: false,
		interval: 'once',
		currency: 'eur',
		amountMinor: 299,
		trialDays: 0,
		accessDays: 3,
		...over,
	}) as PlanCard

const yearly = card({ id: 'individual_yearly', interval: 'year', amountMinor: 3999, accessDays: 0 })

describe('passOfferFor', () => {
	test('price comes from the catalogue card in its currency', () => {
		const offer = passOfferFor([yearly, card({ currency: 'gbp', amountMinor: 349 })], 'en-GB')
		expect(offer?.days).toBe(3)
		expect(offer?.price).toBe('£3.49')
		expect(passOfferFor([card({})], 'en-US')?.price).toContain('2.99')
	})

	test('hidden when the catalogue read fails or has no pass', () => {
		expect(passOfferFor(null, 'en-US')).toBeNull()
		expect(passOfferFor([], 'en-US')).toBeNull()
		expect(passOfferFor([yearly], 'en-US')).toBeNull()
		expect(passOfferFor([card({ amountMinor: 0 })], 'en-US')).toBeNull()
	})
})

test('a free exit exists for both moments and the pass copy never renews', () => {
	const copy = en.passOffer as Record<string, string>
	expect(copy[passOfferExitKey('first_finish')]).toBe('Keep playing free')
	expect(copy[passOfferExitKey('pick_limit')]).toBe('Come back tomorrow')
	expect(copy.price).toBe('{price} once · no renewal')
	expect(JSON.stringify(copy)).not.toMatch(/\/yr|a year|subscri|renews/i)
})

test('shows once per context per server day', () => {
	const map = new Map<string, string>()
	const store = {
		getItem: (k: string) => map.get(k) ?? null,
		setItem: (k: string, v: string) => void map.set(k, v),
	}
	expect(passOfferSeen(store, 'first_finish', '2026-11-27')).toBe(false)
	markPassOfferSeen(store, 'first_finish', '2026-11-27')
	expect(passOfferSeen(store, 'first_finish', '2026-11-27')).toBe(true)
	expect(passOfferSeen(store, 'pick_limit', '2026-11-27')).toBe(false)
	expect(passOfferSeen(store, 'first_finish', '2026-11-28')).toBe(false)
	expect(passOfferSeen(null, 'first_finish', '2026-11-27')).toBe(false)
})
