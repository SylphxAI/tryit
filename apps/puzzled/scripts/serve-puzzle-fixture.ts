/**
 * Deterministic GetDaily fixture API for the post-merge browser harnesses.
 * It speaks the same Connect JSON protocol as the generated client, serves
 * real frozen boards, and never implements account or write operations.
 */
import catalogue from '../../../config/commercial/catalogue.json'
import { frozenPuzzle } from '../src/games/test-fixtures'
import type { PuzzleDifficulty } from '../src/games/types'
import { isValidDayKey, productDayKey } from '../src/lib/product-day'
import { fixtureToken } from './auth-fixture-facts'
import { fixtureShareId } from './share-fixture-facts'

const DIFFICULTIES = new Set<PuzzleDifficulty>(['easy', 'medium', 'hard'])

type GetDailyWireRequest = {
	gameSlug?: unknown
	difficulty?: unknown
	puzzleDate?: unknown
}

function connectError(status: number, code: string, message: string) {
	return Response.json({ code, message }, { status })
}

/**
 * A read-only price list for pricing-page captures, with the amounts of
 * config/commercial/catalogue.json. It is opt-in because an
 * open store locks every game but the free one for guests, which is not the
 * state the board and home harnesses run in.
 */
const PLAN_IDS: Record<string, string> = {
	plus_individual_monthly: 'individual_monthly',
	plus_individual_yearly: 'individual_yearly',
	plus_family_monthly: 'family_monthly',
	plus_family_yearly: 'family_yearly',
	puzzled_starter_unlock: 'individual_once',
}

const OPEN_PLANS = {
	salesOpen: true,
	familyMaxMembers: 4,
	plans: catalogue.plans.map((plan) => ({
		id: PLAN_IDS[plan.price_key] ?? plan.price_key,
		family: plan.grants.seats !== '1',
		interval: plan.interval,
		prices: Object.entries(plan.unit_amounts).map(([currency, amount]) => ({
			currency,
			unitAmountMinor: String(amount),
		})),
		trialDays: plan.trial_days,
		...(plan.interval === '' ? { accessDays: 3 } : {}),
	})),
}

export function createPuzzleFixtureServer(port = 8787, options: { openPlans?: boolean } = {}) {
	return Bun.serve({
		hostname: '127.0.0.1',
		port,
		async fetch(request: Request) {
			const url = new URL(request.url)
			if (url.pathname === '/healthz') return new Response('ok')
			const cookies = request.headers.get('cookie')?.split('; ') ?? []
			// The completed-set browser case uses a fixture-issued guest marker.
			// Admit it for play progress, never for the account-only billing read.
			const completedSet = cookies.includes('__Host-puzzled_guest=completed-set-fixture')
			const noPassPrice = cookies.includes('__Host-puzzled_guest=no-pass-price-fixture')
			if ((completedSet || noPassPrice) && request.method === 'POST') {
				const dayKey = productDayKey()
				const gameSlugs = ['crowns', 'number-path', 'sudoku']
				switch (url.pathname) {
					case '/puzzled.v1.PuzzleService/GetDaily':
						return Response.json({
							gameSlug: 'sudoku',
							puzzleDate: dayKey,
							hasCompleted: true,
							canPlay: false,
							completedSession: { status: 'won', attempts: 1, score: 900, timeSpentMs: '78098' },
						})
					case '/puzzled.v1.PuzzleService/GetTodayProgress':
						return Response.json({
							dayKey,
							freePicks: { gameSlugs },
							games: gameSlugs.map((gameSlug) => ({ gameSlug, hasCompleted: true })),
						})
					case '/puzzled.v1.BillingService/GetSubscription':
						return connectError(401, 'unauthenticated', 'identity_required')
					case '/puzzled.v1.BillingService/ListPlans':
						return Response.json(
							noPassPrice
								? {
										...OPEN_PLANS,
										plans: OPEN_PLANS.plans.filter((plan) => plan.id !== 'individual_once'),
									}
								: OPEN_PLANS,
						)
				}
			}
			if (url.pathname === '/v1/guest/session' && request.method === 'POST') {
				return Response.json({ issued: true })
			}
			if (
				url.pathname === '/puzzled.v1.StatsService/GetTodayOverview' &&
				request.method === 'POST'
			) {
				return Response.json({ playerCount: 1 })
			}
			if (url.pathname === '/puzzled.v1.BillingService/ListPlans' && request.method === 'POST') {
				// readUnlockPrices runs on the server; opt in only the test's guest context.
				if (cookies.includes('__Host-puzzled_guest=first-finish-fixture')) {
					const prices = [{ currency: 'eur', unitAmountMinor: '299' }]
					const plans = [{ id: 'individual_once', accessDays: 3, prices }]
					return Response.json({ salesOpen: true, plans })
				}
				if (
					options.openPlans &&
					cookies?.includes('__Host-puzzled_guest=pricing-catalogue-change')
				) {
					return Response.json({
						...OPEN_PLANS,
						plans: OPEN_PLANS.plans.filter((plan) => plan.id !== 'family_monthly'),
					})
				}
				if (options.openPlans && cookies.includes('__Host-puzzled_guest=archive-no-pass')) {
					return Response.json({
						...OPEN_PLANS,
						plans: OPEN_PLANS.plans.filter(({ id }) => id !== 'individual_once'),
					})
				}
				if (options.openPlans) return Response.json(OPEN_PLANS)
			}
			if (
				url.pathname === '/puzzled.v1.PuzzleService/GetSharedResult' &&
				request.method === 'POST'
			) {
				const body = await request.json().catch(() => null)
				if (request.headers.has('cookie') || body?.shareId !== fixtureShareId) {
					return connectError(404, 'not_found', 'not_found')
				}
				return Response.json({
					gameSlug: 'sudoku',
					puzzleDate: productDayKey(),
					status: 'won',
					attempts: 1,
					score: 37,
				})
			}
			// Read-only facts for the first earned Plus prompt, with the Auth fixture member.
			const fixtureMember = request.headers
				.get('cookie')
				?.split('; ')
				.includes(`puzzled_session=${fixtureToken}`)
			if (options.openPlans && fixtureMember && request.method === 'POST') {
				if (url.pathname === '/puzzled.v1.GamificationService/GetStreakInfo') {
					return Response.json({
						info: {
							currentStreak: 3,
							maxStreak: 3,
							totalGamesPlayed: 3,
							playedDays: 3,
							hasPlayedToday: true,
							daysUntilNextFreeze: 4,
						},
					})
				}
				if (url.pathname === '/puzzled.v1.BillingService/GetSubscription') {
					return Response.json({ salesOpen: true, entitled: false })
				}
			}
			// Opt-in browser cap journey. The marker is a fixture-only cookie, never
			// accepted as identity by the production API.
			const capFixture =
				options.openPlans &&
				request.headers.get('cookie')?.includes('__Host-puzzled_guest=cap-fixture')
			if (capFixture && url.pathname === '/puzzled.v1.PuzzleService/GetTodayProgress') {
				const { gameSlugs = [] } = await request.json()
				return Response.json({
					dayKey: productDayKey(),
					freePicks: { gameSlugs: ['sudoku', 'number-path', 'killer-sudoku'] },
					games: gameSlugs.map((gameSlug: string) => ({
						gameSlug,
						hasCompleted: gameSlug === 'sudoku',
					})),
				})
			}
			if (url.pathname !== '/puzzled.v1.PuzzleService/GetDaily') {
				return connectError(404, 'not_found', 'not_found')
			}
			if (request.method !== 'POST') {
				return connectError(405, 'unimplemented', 'post_required')
			}

			let input: GetDailyWireRequest
			try {
				input = (await request.json()) as GetDailyWireRequest
			} catch {
				return connectError(400, 'invalid_argument', 'invalid_json')
			}
			const slug = typeof input.gameSlug === 'string' ? input.gameSlug.trim() : ''
			if (!slug) return connectError(400, 'invalid_argument', 'game_slug_required')
			if (capFixture && slug === 'crowns')
				return connectError(403, 'permission_denied', 'plus_required')
			const requestedDifficulty =
				typeof input.difficulty === 'string' ? input.difficulty.trim() : ''
			if (requestedDifficulty && !DIFFICULTIES.has(requestedDifficulty as PuzzleDifficulty)) {
				return connectError(400, 'invalid_argument', 'invalid_difficulty')
			}
			const difficulty = requestedDifficulty ? (requestedDifficulty as PuzzleDifficulty) : undefined
			const today = productDayKey()
			const requestedDate =
				typeof input.puzzleDate === 'string' && input.puzzleDate.trim()
					? input.puzzleDate.trim()
					: today
			if (!isValidDayKey(requestedDate) || requestedDate > today) {
				return connectError(400, 'invalid_argument', 'invalid_puzzle_date')
			}

			try {
				const { puzzleData, solution } = frozenPuzzle({ slug }, difficulty)
				// Word-search's public board includes the words to find, but never
				// their placements. Its frozen generator case stores those words in
				// the private solution, so project only that one public field.
				const servedData =
					slug === 'word-search' &&
					typeof puzzleData === 'object' &&
					puzzleData !== null &&
					typeof solution === 'object' &&
					solution !== null &&
					'words' in solution &&
					Array.isArray(solution.words)
						? { ...puzzleData, words: solution.words }
						: puzzleData
				return Response.json({
					gameSlug: slug,
					puzzleNumber: 1,
					puzzleDate: requestedDate,
					difficulty: requestedDifficulty,
					hasCompleted: false,
					canPlay: true,
					mode: requestedDate === today ? 'daily' : 'archive',
					slice: 'CI-frozen-fixture',
					stub: false,
					puzzleDataJson: JSON.stringify(servedData),
				})
			} catch {
				return connectError(404, 'not_found', 'unknown_game_or_difficulty')
			}
		},
	})
}

if (import.meta.main) {
	const server = createPuzzleFixtureServer(Number(process.env.FIXTURE_API_PORT ?? 8787), {
		openPlans: process.env.FIXTURE_OPEN_PLANS === '1',
	})
	console.log(`fixture GetDaily listening on http://127.0.0.1:${server.port}`)
	await new Promise(() => {})
}
