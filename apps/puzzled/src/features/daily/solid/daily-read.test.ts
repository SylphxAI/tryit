import { expect, test } from 'bun:test'
import { readDailyLanding } from './daily-read'

// Use the actual request-local Connect transport: no guest bootstrap or StartDaily
// is allowed, and a denied or finished viewer must not inherit the guest board.
test('passive daily SSR reads preserve per-viewer admission and retry failed reads in the browser', async () => {
	const originalBase = process.env.API_INTERNAL_URL
	const originalFetch = globalThis.fetch
	const seen: string[] = []
	const puzzleDate = '2026-11-22'
	process.env.API_INTERNAL_URL = 'http://daily.test'
	globalThis.fetch = (async (input, init) => {
		const request = new Request(input, init)
		seen.push(request.url)
		await expect(request.json()).resolves.toMatchObject({
			gameSlug: 'nonogram',
			difficulty: 'easy',
		})
		switch (request.headers.get('cookie')) {
			case 'puzzled_session=finished':
				return Response.json({
					puzzleDate,
					hasCompleted: true,
					completedSession: { status: 'won', attempts: 1 },
				})
			case 'puzzled_session=denied':
				return Response.json(
					{ code: 'permission_denied', message: 'plus_required' },
					{ status: 403 },
				)
			case 'puzzled_session=unavailable':
				return Response.json({ canPlay: true, puzzleDate, stub: true })
			default:
				return Response.json({ canPlay: true, puzzleDate, requiresStart: true })
		}
	}) as typeof fetch
	try {
		const snapshots = await Promise.all(
			['finished', 'denied', 'unavailable', ''].map((session) =>
				readDailyLanding(new Headers(session ? { cookie: `puzzled_session=${session}` } : {}), {
					gameSlug: 'nonogram',
					difficulty: 'easy',
				}),
			),
		)
		expect(snapshots).toEqual([
			{
				kind: 'completed',
				puzzleDate,
				session: { status: 'won', attempts: 1, score: 0, completedAt: null, difficulty: undefined },
			},
			{ kind: 'locked' },
			undefined,
			{ kind: 'startable', puzzleDate },
		])
		expect(seen).toEqual(Array(4).fill('http://daily.test/puzzled.v1.PuzzleService/GetDaily'))
	} finally {
		globalThis.fetch = originalFetch
		if (originalBase === undefined) delete process.env.API_INTERNAL_URL
		else process.env.API_INTERNAL_URL = originalBase
	}
})
