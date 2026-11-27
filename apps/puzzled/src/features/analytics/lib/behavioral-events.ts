import { canonicalizeGameSlug, PLAYER_TITLE } from '@/lib/game-slug'
import { hasAnalyticsConsent } from './consent'
import { sendFunnel } from './funnel'
import { sendGa4Event } from './google-tag'
import { trackGameFinishStage } from './signal-stages'

const modes = ['daily', 'archive', 'practice'] as const
const actions = ['copy_challenge', 'save_png', 'native_share'] as const
const platforms = ['chromium', 'ios_guide', 'other'] as const
const currencies = [
	'USD',
	'GBP',
	'EUR',
	'HKD',
	'TWD',
	'JPY',
	'KRW',
	'MYR',
	'SGD',
	'CAD',
	'AUD',
	'NZD',
	'THB',
	'PHP',
	'IDR',
	'VND',
] as const
const timeBuckets = [0, 30, 60, 120, 300, 600, 1200, 1800] as const
const progressBuckets = [0, 25, 50, 75] as const

export type GameMode = (typeof modes)[number]
export type ShareAction = (typeof actions)[number]
export type PwaPlatform = (typeof platforms)[number]
export type PushTrigger = 'post_win' | 'settings'
export type BehavioralEvent =
	| {
			event: 'game_complete'
			game_slug: string
			mode: GameMode
			status: 'won' | 'lost'
			pick_index: 1 | 2 | 3 | null
			time_bucket_s: number
			is_guest: boolean
	  }
	| {
			event: 'game_abandon'
			game_slug: string
			mode: GameMode
			progress_pct_bucket: number
			is_guest: boolean
	  }
	| { event: 'hint_used'; game_slug: string; mode: GameMode; hint_count: number }
	| { event: 'share_clicked'; game_slug: string; action: ShareAction; has_percentile: boolean }
	| {
			event: 'paywall_hit'
			surface: '4th_game_lock' | 'archive_lock' | 'practice_upsell'
			game_slug: string
			picks_used: number
			currency: string
			is_guest: boolean
	  }
	| {
			event: 'pwa_install_prompted' | 'pwa_installed'
			platform: PwaPlatform
			trigger: 'post_first_win' | 'returning_home'
			is_guest?: boolean
	  }
	| {
			event: 'save_streak_prompted' | 'save_streak_clicked'
			outcome: 'won' | 'lost'
			trigger: 'daily_finish'
	  }
	| { event: 'push_opted_in'; trigger: PushTrigger; result: 'granted' | 'denied' | 'dismissed' }

function oneOf<T>(value: unknown, allowed: readonly T[]): value is T {
	return allowed.some((option) => value === option)
}

function integer(value: unknown, min: number, max: number): value is number {
	return typeof value === 'number' && Number.isInteger(value) && value >= min && value <= max
}

/** Rebuild exact event schemas at runtime: types alone cannot strip extra fields. */
function sanitize(input: BehavioralEvent): BehavioralEvent | undefined {
	const { event } = input
	const slug =
		'game_slug' in input && typeof input.game_slug === 'string' && input.game_slug.length <= 64
			? canonicalizeGameSlug(input.game_slug)
			: ''
	const game_slug = Object.hasOwn(PLAYER_TITLE, slug) ? slug : undefined
	switch (event) {
		case 'game_complete': {
			const { mode, status, pick_index, time_bucket_s, is_guest } = input
			if (
				game_slug &&
				oneOf(mode, modes) &&
				oneOf(status, ['won', 'lost']) &&
				oneOf(pick_index, [1, 2, 3, null]) &&
				oneOf(time_bucket_s, timeBuckets) &&
				typeof is_guest === 'boolean'
			) {
				return { event, game_slug, mode, status, pick_index, time_bucket_s, is_guest }
			}
			break
		}
		case 'game_abandon': {
			const { mode, progress_pct_bucket, is_guest } = input
			if (
				game_slug &&
				oneOf(mode, modes) &&
				oneOf(progress_pct_bucket, progressBuckets) &&
				typeof is_guest === 'boolean'
			) {
				return { event, game_slug, mode, progress_pct_bucket, is_guest }
			}
			break
		}
		case 'hint_used': {
			const { mode, hint_count } = input
			if (game_slug && oneOf(mode, modes) && integer(hint_count, 1, 100))
				return { event, game_slug, mode, hint_count }
			break
		}
		case 'share_clicked': {
			const { action, has_percentile } = input
			if (game_slug && oneOf(action, actions) && typeof has_percentile === 'boolean')
				return { event, game_slug, action, has_percentile }
			break
		}
		case 'paywall_hit': {
			const { surface, picks_used, is_guest } = input
			const currency =
				typeof input.currency === 'string' && /^[A-Za-z]{3}$/.test(input.currency)
					? input.currency.toUpperCase()
					: ''
			if (
				game_slug &&
				oneOf(surface, ['4th_game_lock', 'archive_lock', 'practice_upsell']) &&
				integer(picks_used, 0, 3) &&
				oneOf(currency, currencies) &&
				typeof is_guest === 'boolean'
			) {
				return { event, game_slug, surface, picks_used, currency, is_guest }
			}
			break
		}
		case 'pwa_install_prompted':
		case 'pwa_installed': {
			const { platform, trigger, is_guest } = input
			if (oneOf(platform, platforms) && oneOf(trigger, ['post_first_win', 'returning_home'])) {
				if (is_guest === undefined) return { event, platform, trigger }
				if (typeof is_guest === 'boolean') return { event, platform, trigger, is_guest }
			}
			break
		}
		case 'save_streak_prompted':
		case 'save_streak_clicked': {
			const { outcome, trigger } = input
			if (oneOf(outcome, ['won', 'lost']) && trigger === 'daily_finish')
				return { event, outcome, trigger }
			break
		}
		case 'push_opted_in': {
			const { trigger, result } = input
			if (
				oneOf(trigger, ['post_win', 'settings']) &&
				oneOf(result, ['granted', 'denied', 'dismissed'])
			)
				return { event, trigger, result }
			break
		}
	}
}

export function trackBehavioralEvent(input: BehavioralEvent): void {
	if (typeof window === 'undefined') return
	try {
		const clean = sanitize(input)
		if (!clean) return
		// Daily first-party finishes come from committed game_sessions, not this callback.
		if (clean.event !== 'game_complete' || clean.mode !== 'daily') sendFunnel(clean)
		const { event, ...params } = clean
		if (hasAnalyticsConsent()) sendGa4Event(event, params)
	} catch {
		// Telemetry must not affect a game, payment, install, or permission prompt.
	}
}

export function trackHintUsed(game_slug: string, mode: GameMode, hint_count: number): void {
	trackBehavioralEvent({ event: 'hint_used', game_slug, mode, hint_count })
}

/** One lifecycle per mounted board. No guesses, user identifiers, or draft are read. */
export function createGameBehavior(
	game_slug: string,
	mode: GameMode,
	isGuest: () => boolean | undefined,
) {
	let progress: number | undefined
	let terminal = false
	let abandoned = false
	return {
		interact(percent?: number) {
			if (!terminal)
				progress = percent !== undefined && Number.isFinite(percent) ? percent : (progress ?? 0)
		},
		complete(status: 'won' | 'lost', elapsedMs: number, pickIndex: number | null) {
			if (terminal) return
			terminal = true
			try {
				trackGameFinishStage(game_slug, mode, status)
			} catch {
				// Telemetry must not affect a finish.
			}
			const is_guest = isGuest()
			if (is_guest === undefined) return
			trackBehavioralEvent({
				event: 'game_complete',
				game_slug,
				mode,
				status,
				is_guest,
				pick_index: mode === 'daily' && oneOf(pickIndex, [1, 2, 3] as const) ? pickIndex : null,
				time_bucket_s: timeBuckets.findLast((bucket) => elapsedMs >= bucket * 1000) ?? 0,
			})
		},
		abandon() {
			if (terminal || abandoned || progress === undefined) return
			const is_guest = isGuest()
			if (is_guest === undefined) return
			const percent = progress
			abandoned = true
			trackBehavioralEvent({
				event: 'game_abandon',
				game_slug,
				mode,
				is_guest,
				progress_pct_bucket: progressBuckets.findLast((bucket) => percent >= bucket) ?? 0,
			})
		},
		alreadyPlayed() {
			terminal = true
		},
	}
}
