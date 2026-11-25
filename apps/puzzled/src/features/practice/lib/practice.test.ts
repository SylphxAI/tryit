import { expect, mock, test } from 'bun:test'
import { Code, ConnectError } from '@connectrpc/connect'
import {
	checkoutEntrySurface,
	trustedCheckoutTrigger,
	trustedEntrySurface,
} from '@/features/analytics/lib/checkout-entry-surface'
import { resolvePricingCheckoutTrigger } from '@/features/plus-offer/lib/plus-offer'
import { getAllGameMetadata } from '@/games/registry'
import { isPracticeSupported, PRACTICE_GAMES, practicePath, practiceRefusal } from './practice'

const track = mock(() => {})
mock.module('@/features/analytics/lib/behavioral-events', () => ({ trackBehavioralEvent: track }))
const { practiceImpression, practicePricingHref } = await import('./practice-impression')

test('practice matches the six supported games and links preserve the level', () => {
	const rustPracticeGames = [
		'sudoku',
		'word-guess',
		'quad-words',
		'crowns',
		'nonogram',
		'pattern-match',
	] as const
	expect(PRACTICE_GAMES).toEqual(rustPracticeGames)
	expect(
		getAllGameMetadata()
			.map(({ slug }) => slug)
			.filter(isPracticeSupported)
			.sort(),
	).toEqual([...rustPracticeGames].sort())
	expect(practicePath('/zh-TW/games/crowns', 'hard')).toBe(
		'/zh-TW/games/crowns?mode=practice&difficulty=hard#play',
	)
	expect(practicePath('/games/word-guess')).toBe('/games/word-guess?mode=practice#play')
})

test('only authoritative practice refusals offer Plus', () => {
	expect(
		practiceRefusal(new ConnectError('identity_required_for_practice', Code.Unauthenticated)),
	).toBe('guest')
	expect(
		practiceRefusal(new ConnectError('plus_required_for_practice', Code.PermissionDenied)),
	).toBe('free')
	expect(
		practiceRefusal(new ConnectError('plus_required_for_practice', Code.Unavailable)),
	).toBeUndefined()
	expect(practiceRefusal(new ConnectError('access_denied', Code.PermissionDenied))).toBeUndefined()
})

test('PracticeUnlock impression and CTA use the trusted practice checkout surface', () => {
	const href = practicePricingHref('en-US')
	expect(href).toBe('/pricing?trigger=practice_upsell')
	expect(practicePricingHref('es')).toBe('/es/pricing?trigger=practice_upsell')
	const trigger = new URL(href, 'https://tryit.fun').searchParams.get('trigger') ?? undefined
	expect(trustedEntrySurface(trigger)).toBe('practice_upsell')
	expect(trustedCheckoutTrigger(trigger)).toBe('practice_upsell')
	expect(checkoutEntrySurface(trigger)).toBe('practice_upsell')
	expect(resolvePricingCheckoutTrigger({ trigger, fallback: 'pricing_card' })).toBe(
		'practice_upsell',
	)

	const report = practiceImpression('sudoku', 'en-US', true)
	report(undefined, 'GBP')
	expect(track).not.toHaveBeenCalled()
	report(2, 'GBP')
	report(2, 'USD')
	expect(track).toHaveBeenCalledTimes(1)
	expect(track).toHaveBeenCalledWith({
		event: 'paywall_hit',
		surface: 'practice_upsell',
		game_slug: 'sudoku',
		picks_used: 2,
		currency: 'GBP',
		is_guest: true,
	})
})
