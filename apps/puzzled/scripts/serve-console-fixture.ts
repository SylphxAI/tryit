/** Read-only, loopback-only Connect fixture for the production console browser tests. */
import { fixtureToken } from './auth-fixture-facts'

Bun.serve({
	hostname: '127.0.0.1',
	port: Number(process.env.FIXTURE_API_PORT ?? 18886),
	async fetch(request) {
		const path = new URL(request.url).pathname
		const cookie = request.headers.get('cookie') ?? ''
		const pairs = cookie.split(/; */)
		const authenticated = pairs.some((pair) => pair.endsWith(`=${fixtureToken}`))
		const privateReadsUnavailable = pairs.includes('__Host-puzzled_guest=unavailable')
		const unavailable = () => Response.json({ code: 'unavailable' }, { status: 503 })
		if (path === '/healthz') return new Response('ok')
		if (request.method !== 'POST' || pairs.includes('unrelated_cookie=must-not-forward')) {
			return Response.json({ code: 'invalid_argument' }, { status: 400 })
		}
		if (path === '/puzzled.v1.StatsService/GetUserStats' && authenticated) {
			if (privateReadsUnavailable) return unavailable()
			return Response.json({ games: [{ gameSlug: 'sudoku', gamesPlayed: 8, gamesWon: 6 }] })
		}
		if (path === '/puzzled.v1.GamificationService/GetStreakInfo' && authenticated) {
			if (privateReadsUnavailable) return unavailable()
			return Response.json({ info: { currentStreak: 4, maxStreak: 6, daysUntilNextFreeze: 3 } })
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
