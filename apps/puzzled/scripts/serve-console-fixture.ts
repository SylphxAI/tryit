/** Read-only, loopback-only Connect fixture for the production console browser tests. */
import { productDayKey } from '../src/lib/product-day'
import { fixtureToken } from './auth-fixture-facts'

Bun.serve({
	hostname: '127.0.0.1',
	port: Number(process.env.FIXTURE_API_PORT ?? 18886),
	async fetch(request) {
		const path = new URL(request.url).pathname
		const cookie = request.headers.get('cookie') ?? ''
		const pairs = cookie.split(/; */)
		const authenticated = pairs.some((pair) => pair.endsWith(`=${fixtureToken}`))
		const guest = pairs.includes('__Host-puzzled_guest=console-guest')
		const hasRecord = authenticated || guest
		const privateReadsUnavailable = pairs.includes('__Host-puzzled_guest=unavailable')
		const unavailable = () => Response.json({ code: 'unavailable' }, { status: 503 })
		if (path === '/healthz') return new Response('ok')
		if (request.method !== 'POST' || pairs.includes('unrelated_cookie=must-not-forward')) {
			return Response.json({ code: 'invalid_argument' }, { status: 400 })
		}
		if (path === '/puzzled.v1.StatsService/GetUserStats' && hasRecord) {
			if (privateReadsUnavailable) return unavailable()
			return Response.json({
				games: [
					{
						gameSlug: 'sudoku',
						gamesPlayed: authenticated ? 8 : 3,
						gamesWon: authenticated ? 6 : 2,
						bestScore: 42,
					},
				],
			})
		}
		if (path === '/puzzled.v1.GamificationService/GetStreakInfo' && hasRecord) {
			if (privateReadsUnavailable) return unavailable()
			return Response.json({
				info: {
					currentStreak: authenticated ? 4 : 2,
					maxStreak: 6,
					daysUntilNextFreeze: 3,
					hasPlayedToday: true,
					freezesAvailable: 1,
					autoFreezeEnabled: true,
				},
			})
		}
		if (path === '/puzzled.v1.StatsService/GetHistory' && hasRecord) {
			if (privateReadsUnavailable || pairs.includes('__Host-puzzled_guest=history-unavailable'))
				return unavailable()
			const body = await request.json()
			if (body.limit !== 100) return unavailable()
			return Response.json({
				sessions: [
					{
						gameSlug: 'sudoku',
						puzzleId: 'internal-id-not-for-browser',
						puzzleDate: productDayKey(),
						mode: 'daily',
						status: 'won',
						score: 42,
						timeSpentMs: 65000,
					},
				],
			})
		}
		if (path === '/puzzled.v1.PuzzleService/GetTodayProgress' && hasRecord) {
			if (privateReadsUnavailable) return unavailable()
			const body = await request.json()
			if (body.gameSlugs?.length !== 19) return unavailable()
			return Response.json({
				games: body.gameSlugs.map((gameSlug: string) => ({
					gameSlug,
					hasCompleted: gameSlug === 'sudoku',
				})),
			})
		}
		if (path === '/puzzled.v1.BillingService/ListPlans') {
			return Response.json({
				salesOpen: true,
				plans: [
					{
						id: 'individual_yearly',
						interval: 'year',
						prices: [{ currency: 'USD', unitAmountMinor: '3500' }],
					},
				],
			})
		}
		if (path === '/puzzled.v1.BillingService/GetSubscription') {
			if (!authenticated || privateReadsUnavailable) return unavailable()
			return Response.json({ salesOpen: true, entitled: true })
		}
		if (path === '/puzzled.v1.StatsService/GetLeaderboard') {
			const body = await request.json()
			if (body.limit !== 10) return unavailable()
			if (body.gameSlug === 'crossword') return unavailable()
			if (body.gameSlug === 'sudoku' && body.period === 'LEADERBOARD_PERIOD_WEEK') {
				return Response.json({ entries: [] })
			}
			return Response.json({
				entries: [
					{
						rank: 1,
						userId: 'opaque-only',
						userName: 'Fixture player',
						value: 321,
						isViewer: authenticated,
					},
				],
			})
		}
		return Response.json({ code: 'not_found' }, { status: 404 })
	},
})
