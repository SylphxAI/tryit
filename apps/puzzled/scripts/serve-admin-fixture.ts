/** Local-only Auth and Connect fixtures. The web must not infer admin from Auth. */
const member = 'fixture-session'
const operator = 'fixture-operator-session'
const id = 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee'
const day = '2026-11-21'
const timestamp = `${day}T00:00:00Z`
const project = 'organization-00000000-0000-4000-8000-000000000123'
const calls: { method: string; input: object }[] = []
let announcement: Record<string, unknown> | undefined
let queueState = 'pending'

Bun.serve({
	hostname: '127.0.0.1',
	port: Number(process.env.ADMIN_FIXTURE_PORT ?? 18897),
	async fetch(request) {
		const path = new URL(request.url).pathname
		if (path === '/v1/sessions/current') {
			const credential = request.headers.get('authorization')
			if (credential !== `Bearer ${member}` && credential !== `Bearer ${operator}`)
				return Response.json({}, { status: 401 })
			return Response.json({
				principal: {
					principal_id: 'fixture-player',
					project_id: project,
					primary_email: 'synthetic@example.test',
				},
			})
		}
		if (path === '/__fixture') {
			if (request.method === 'DELETE') {
				announcement = undefined
				queueState = 'pending'
				calls.length = 0
			}
			return Response.json(calls)
		}
		if (!path.startsWith('/puzzled.v1.AdminService/')) return Response.json({}, { status: 404 })
		const method = path.slice(path.lastIndexOf('/') + 1)
		const input = (await request.json()) as Record<string, unknown>
		const cookie = request.headers.get('cookie') ?? ''
		if (!cookie.split('; ').includes(`puzzled_session=${operator}`))
			return Response.json({ code: 'permission_denied' }, { status: 403 })
		calls.push({ method, input })
		switch (method) {
			case 'GetSettings':
				return Response.json({
					settings: [{ key: 'not-for-document', valueJson: 'fixture-settings-marker' }],
				})
			case 'ListAnnouncements':
				return Response.json({ announcements: announcement ? [announcement] : [] })
			case 'CreateAnnouncement':
			case 'UpdateAnnouncement':
				announcement = { ...input, id, createdAt: timestamp }
				return Response.json({ announcement })
			case 'DeleteAnnouncement':
				announcement = undefined
				return Response.json({ deleted: true })
			case 'ListDlq':
				return Response.json({
					entries: [
						{
							id,
							jobType: 'fixture-failed-job',
							payloadJson: '{"fixture":true}',
							status: queueState,
							attempts: 1,
							error: 'synthetic failure',
							createdAt: timestamp,
						},
					],
					total: 1,
					[queueState]: 1,
				})
			case 'RetryDlq':
				queueState = 'retrying'
				return Response.json({ ok: true })
			case 'ResolveDlq':
				queueState = 'resolved'
				return Response.json({ ok: true })
			case 'MarkDlqFailed':
				queueState = 'failed'
				return Response.json({ ok: true })
			case 'ListAuditLogs':
				return Response.json({
					entries: [
						{
							id,
							action: 'update',
							entityType: 'fixture-resource',
							metadataJson: '{"fixture":"audit marker"}',
							createdAt: timestamp,
						},
					],
					total: input.action ? 1 : 51,
				})
			case 'GamesOverview':
				return Response.json({
					games: [
						{
							slug: 'sudoku',
							name: 'Sudoku',
							todayPlayed: 2,
							todayWins: 1,
							allTimePlayed: 8,
							allTimeWins: 6,
						},
					],
				})
			case 'GetGameAnalytics':
				return Response.json({
					dailyStats: [{ date: day, gamesPlayed: 2, wins: 1, avgAttempts: 3 }],
				})
			case 'SystemHealth':
				return Response.json({ databaseOk: true, uptime: 'fixture uptime' })
			case 'GetMetricsReport':
				return Response.json({
					days: [
						{
							dayKey: day,
							dailyPuzzleCompleters: 8,
							signedInCompleters: 2,
							cohorts: { d1Cohort: 20, d1Returned: 4, d1CohortGuestEntry: 8 },
							guestStartCohort: { started: 10, completedSameDay: 4 },
						},
						{ dayKey: '2026-11-20', complete: true, cohorts: {}, guestStartCohort: {} },
						{ dayKey: '2026-11-19', complete: true },
					],
					stale: true,
				})
			default:
				return Response.json({ code: 'unimplemented' }, { status: 501 })
		}
	},
})
