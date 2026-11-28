import { afterEach, expect, test } from 'bun:test'
import { CONSENT_KEY } from '@/lib/storage-keys'
import {
	type BehavioralEvent,
	createGameBehavior,
	trackBehavioralEvent,
	trackHintUsed,
} from './behavioral-events'
import { setConsentContext } from './consent'
import { FUNNEL_PATH } from './funnel'
import { setActiveGoogleTag } from './google-tag'

const events = [
	[
		{
			event: 'game_complete',
			game_slug: 'sudoku',
			mode: 'archive',
			status: 'won',
			pick_index: null,
			time_bucket_s: 0,
			is_guest: false,
		},
		{ gameSlug: 'sudoku', mode: 'archive', status: 'won', timeBucketS: 0, isGuest: false },
	],
	[
		{
			event: 'game_abandon',
			game_slug: 'word-guess',
			mode: 'archive',
			progress_pct_bucket: 0,
			is_guest: true,
		},
		{ gameSlug: 'word-guess', mode: 'archive', progressPctBucket: 0, isGuest: true },
	],
	[
		{ event: 'hint_used', game_slug: 'cryptogram', mode: 'practice', hint_count: 2 },
		{ gameSlug: 'cryptogram', mode: 'practice', hintCount: 2 },
	],
	[
		{ event: 'share_clicked', game_slug: 'nonogram', action: 'save_png', has_percentile: false },
		{ gameSlug: 'nonogram', action: 'save_png', hasPercentile: false },
	],
	[
		{
			event: 'paywall_hit',
			surface: 'archive_lock',
			game_slug: 'sudoku',
			picks_used: 0,
			currency: 'GBP',
			is_guest: true,
		},
		{ surface: 'archive_lock', gameSlug: 'sudoku', picksUsed: 0, currency: 'GBP', isGuest: true },
	],
	[
		{
			event: 'pwa_install_prompted',
			platform: 'ios_guide',
			trigger: 'post_first_win',
			is_guest: true,
		},
		{ platform: 'ios_guide', trigger: 'post_first_win', isGuest: true },
	],
	[
		{ event: 'pwa_installed', platform: 'chromium', trigger: 'post_first_win', is_guest: false },
		{ platform: 'chromium', trigger: 'post_first_win', isGuest: false },
	],
	[
		{ event: 'save_streak_prompted', outcome: 'won', trigger: 'daily_finish' },
		{ status: 'won', trigger: 'daily_finish' },
	],
	[
		{ event: 'save_streak_clicked', outcome: 'lost', trigger: 'daily_finish' },
		{ status: 'lost', trigger: 'daily_finish' },
	],
	[
		{ event: 'push_opted_in', trigger: 'settings', result: 'dismissed' },
		{ trigger: 'settings', result: 'dismissed' },
	],
] satisfies [BehavioralEvent, Record<string, unknown>][]

const saved = new Map<string, PropertyDescriptor | undefined>()
function setGlobal(key: string, value: unknown) {
	saved.set(key, Object.getOwnPropertyDescriptor(globalThis, key))
	Object.defineProperty(globalThis, key, { value, configurable: true })
}

function browser(consent: 'analytics_only' | 'denied') {
	const posts: { url: string; init?: RequestInit }[] = []
	const ga: unknown[] = []
	const localStorage = {
		getItem: (key: string) => (key === CONSENT_KEY ? consent : null),
		setItem: () => {},
		removeItem: () => {},
	}
	setGlobal(
		'window',
		Object.assign(new EventTarget(), {
			localStorage,
			location: new URL('https://tryit.fun/games/sudoku?token=private'),
		}),
	)
	setGlobal('fetch', async (url: string, init?: RequestInit) => {
		posts.push({ url, init })
		return new Response(null, { status: 204 })
	})
	setConsentContext({ region: 'EEA', gpc: false })
	setActiveGoogleTag({
		sync() {},
		pageView: () => false,
		hasConsent: () => true,
		event: () => false,
		canSendAdsPurchase: () => false,
		adsPurchase: () => false,
		gaEvent: (event, params) => {
			ga.push({ event, ...params })
			return true
		},
	})
	return { posts, ga, bodies: () => posts.map(({ init }) => JSON.parse(String(init?.body))) }
}

afterEach(() => {
	setConsentContext(null)
	setActiveGoogleTag(null)
	for (const [key, descriptor] of saved) {
		if (descriptor) Object.defineProperty(globalThis, key, descriptor)
		else Reflect.deleteProperty(globalThis, key)
	}
	saved.clear()
})

for (const consent of ['analytics_only', 'denied'] as const) {
	test(`all behavioral events use the exact anonymous schema with consent ${consent}`, () => {
		const { posts, ga, bodies } = browser(consent)
		for (const [event] of events) {
			const dirty = {
				...event,
				email: 'private@example.com',
				token: 'private-token',
				user_id: 'private-id',
				url: 'https://example.com/private',
				path: '/login/private',
				value: 10,
			}
			trackBehavioralEvent(dirty)
		}
		expect(posts).toHaveLength(events.length)
		for (const { url, init } of posts) {
			expect(url.endsWith(FUNNEL_PATH)).toBe(true)
			expect(init?.credentials).toBe('omit')
			expect(init?.keepalive).toBe(true)
			expect(init?.referrerPolicy).toBe('origin')
		}
		expect(bodies()).toEqual(events.map(([event, body]) => ({ event: event.event, ...body })))
		expect(ga).toEqual(consent === 'denied' ? [] : events.map(([event]) => event))
	})
}

test('rejects purchase, arbitrary strings in schema fields, and out-of-range numeric data', () => {
	const { posts, ga } = browser('analytics_only')
	for (const input of [
		{ event: 'purchase', value: 10, currency: 'USD' },
		{ ...events[0]?.[0], game_slug: 'constructor' },
		{ ...events[0]?.[0], game_slug: 'sensitive-token' },
		{ ...events[0]?.[0], status: 'player@example.com' },
		{ ...events[0]?.[0], pick_index: 4 },
		{ ...events[0]?.[0], time_bucket_s: 42 },
		{ ...events[1]?.[0], progress_pct_bucket: 99 },
		{ ...events[4]?.[0], currency: 'ZZZ' },
		{ ...events[6]?.[0], platform: 'arbitrary UA' },
	])
		trackBehavioralEvent(input as BehavioralEvent)
	expect(posts).toHaveLength(0)
	expect(ga).toHaveLength(0)
})

for (const consent of ['analytics_only', 'denied'] as const) {
	test(`daily finish skips the first-party POST and preserves GA with consent ${consent}`, () => {
		const { posts, ga } = browser(consent)
		const completed = createGameBehavior('sudoku', 'daily', () => true)
		completed.complete('lost', 91000, 2)
		completed.complete('lost', 91000, 2)
		completed.abandon()
		const unknown = createGameBehavior('sudoku', 'daily', () => undefined)
		unknown.complete('won', 0, null)
		expect(posts).toEqual([])
		expect(ga).toEqual(
			consent === 'denied'
				? []
				: [
						{
							event: 'game_complete',
							game_slug: 'sudoku',
							mode: 'daily',
							status: 'lost',
							pick_index: 2,
							time_bucket_s: 60,
							is_guest: true,
						},
					],
		)
	})
}

test('board lifetime records only actual interaction or accepted finish, at most once per event', () => {
	const { bodies } = browser('denied')
	const abandoned = createGameBehavior('sudoku', 'daily', () => false)
	abandoned.abandon()
	expect(bodies()).toEqual([])
	abandoned.interact(66)
	abandoned.abandon()
	abandoned.abandon()
	const completed = createGameBehavior('sudoku', 'practice', () => true)
	completed.interact()
	completed.complete('lost', 91000, null)
	completed.complete('lost', 91000, null)
	completed.abandon()
	const alreadyPlayed = createGameBehavior('sudoku', 'archive', () => false)
	alreadyPlayed.interact()
	alreadyPlayed.alreadyPlayed()
	alreadyPlayed.abandon()
	trackHintUsed('cryptogram', 'archive', 1)
	expect(bodies()).toEqual([
		{
			event: 'game_abandon',
			gameSlug: 'sudoku',
			mode: 'daily',
			progressPctBucket: 50,
			isGuest: false,
		},
		{
			event: 'game_complete',
			gameSlug: 'sudoku',
			mode: 'practice',
			status: 'lost',
			timeBucketS: 60,
			isGuest: true,
		},
		{ event: 'hint_used', gameSlug: 'cryptogram', mode: 'archive', hintCount: 1 },
	])
})
