import { expect, test } from 'bun:test'
import { startLocalStack } from './local-stack'

const guestCookie = '__Host-puzzled_guest=loopback-fixture'
const setCookies = [
	`${guestCookie}; Path=/; HttpOnly; Secure; SameSite=Lax`,
	'puzzled_guest_id=; Path=/; Max-Age=0',
]

function fixture(service: 'api' | 'web') {
	return Bun.serve({
		hostname: '127.0.0.1',
		port: 0,
		async fetch(request) {
			const { pathname, search } = new URL(request.url)
			return Response.json(
				{
					service,
					path: pathname + search,
					method: request.method,
					body: await request.text(),
					host: request.headers.get('host'),
					forwardedHost: request.headers.get('x-forwarded-host'),
					forwardedProto: request.headers.get('x-forwarded-proto'),
					origin: request.headers.get('origin'),
					cookie: request.headers.get('cookie'),
				},
				service === 'api' && pathname === '/v1/guest/session'
					? { headers: setCookies.map((value) => ['set-cookie', value]) }
					: undefined,
			)
		},
	})
}

test('local ingress serves canonical API prefixes and keeps the web fallback', async () => {
	const api = fixture('api')
	const web = fixture('web')
	const stack = startLocalStack({ port: 0, apiPort: api.port, webPort: web.port })
	const { origin, host } = stack.url

	try {
		const guest = await fetch(`${origin}/v1/guest/session`, {
			method: 'POST',
			headers: { origin, 'content-type': 'application/json' },
			body: '{}',
		})
		expect(guest.status).toBe(200)
		expect(guest.headers.getSetCookie()).toEqual(setCookies)
		expect(await guest.json()).toMatchObject({
			service: 'api',
			method: 'POST',
			path: '/v1/guest/session',
			body: '{}',
			host,
			forwardedHost: host,
			forwardedProto: 'http',
			origin,
		})

		const cookie = guest.headers.getSetCookie()[0]?.split(';')[0] ?? ''
		for (const [path, service] of [
			['/puzzled.v1.FunnelService/RecordEvent?fixture=1', 'api'],
			['/puzzled.v1.BillingService/ListPlans', 'api'],
			['/internal/compute/daily-puzzles', 'api'],
			['/observability/test', 'api'],
			['/healthz', 'api'],
			['/api/observability/test', 'web'],
			['/v1/guest/session-info', 'web'],
			['/puzzled.v1.FunnelServiceExtra/RecordEvent', 'web'],
			['/puzzled.v1.BillingServiceExtra/ListPlans', 'web'],
			['/internal/compute-docs', 'web'],
			['/observability/testing', 'web'],
			['/healthzone', 'web'],
			['/pricing', 'web'],
		] as const) {
			const response = await fetch(`${origin}${path}`, {
				method: 'POST',
				headers: { origin, cookie, 'content-type': 'application/json' },
				body: '{}',
			})
			expect(response.status, path).toBe(200)
			expect(await response.json(), path).toMatchObject({ service, path, cookie: guestCookie })
		}

		await api.stop(true)
		const unavailable = await fetch(`${origin}/puzzled.v1.BillingService/ListPlans`)
		expect(unavailable.status).toBe(502)
		await unavailable.body?.cancel()
	} finally {
		await Promise.all([stack.stop(true), web.stop(true), api.stop(true)])
	}
})
