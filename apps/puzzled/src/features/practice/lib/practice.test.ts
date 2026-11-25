import { expect, mock, test } from 'bun:test'
import { readFileSync } from 'node:fs'
import { Code, ConnectError } from '@connectrpc/connect'
import {
	checkoutEntrySurface,
	trustedCheckoutTrigger,
	trustedEntrySurface,
} from '@/features/analytics/lib/checkout-entry-surface'
import { resolvePricingCheckoutTrigger } from '@/features/plus-offer/lib/plus-offer'
import { getAllGameMetadata, getGameMetadata } from '@/games/registry'
import { isPracticeSupported, PRACTICE_GAMES, practicePath, practiceRefusal } from './practice'

const track = mock(() => {})
mock.module('@/features/analytics/lib/behavioral-events', () => ({ trackBehavioralEvent: track }))
const { practiceImpression, practicePricingHref } = await import('./practice-impression')

test('the seventeen registered practice games match the Rust allowlist in order', () => {
	const source = readFileSync(
		new URL(
			'../../../../../../crates/puzzled-core/src/capabilities/puzzle_play/application/practice.rs',
			import.meta.url,
		),
		'utf8',
	)
	const allowlist = source.match(/pub const PRACTICE_GAMES:.*?= \[([\s\S]*?)\];/)?.[1] ?? ''
	const rustPracticeGames = Array.from(allowlist.matchAll(/"([a-z-]+)"/g), ([, game]) => game)
	expect(rustPracticeGames).toHaveLength(17)
	expect<readonly string[]>(PRACTICE_GAMES).toEqual(rustPracticeGames)
	expect<readonly string[]>(
		getAllGameMetadata()
			.map(({ slug }) => slug)
			.filter(isPracticeSupported)
			.sort(),
	).toEqual([...rustPracticeGames].sort())
	expect(isPracticeSupported('duo')).toBe(true)
	expect(isPracticeSupported('tango')).toBe(false) // The web route canonicalizes the alias.
	expect(isPracticeSupported('crossword')).toBe(false)
	expect(isPracticeSupported('word-groups')).toBe(false)
})

test.each(['killer-sudoku', 'block-slide', 'crowns'])(
	'%s practice links preserve all levels',
	(game) => {
		expect(isPracticeSupported(game)).toBe(true)
		const levels = getGameMetadata(game)?.difficultyLevels
		expect(levels?.map(({ level }) => level)).toEqual(['easy', 'medium', 'hard'])
		for (const { level } of levels ?? []) {
			expect(practicePath(`/zh-TW/games/${game}`, level)).toBe(
				`/zh-TW/games/${game}?mode=practice&difficulty=${level}#play`,
			)
		}
		expect(practicePath('/games/arithmo')).toBe('/games/arithmo?mode=practice#play')
	},
)

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
