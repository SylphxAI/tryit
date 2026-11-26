/** Loopback-only Money responses for subscription browser acceptance; never takes a payment. */
import { fixtureToken } from './auth-fixture-facts'

const service = '/puzzled.v1.BillingService/'
const periodEnd = '1999000000000'
let cancelled = false
let inviteCode = 'old-fixture-invite'
let memberPresent = true
let claimed = false
const calls: { method: string; body: unknown }[] = []
const problem = (status: number, code: string) => Response.json({ code }, { status })

Bun.serve({
	hostname: '127.0.0.1',
	port: Number(process.env.FIXTURE_API_PORT ?? 18894),
	async fetch(request) {
		const path = new URL(request.url).pathname
		if (path === '/__fixture') {
			if (request.method === 'DELETE') {
				calls.length = 0
				cancelled = false
				claimed = false
				inviteCode = 'old-fixture-invite'
				memberPresent = true
			}
			return Response.json(calls)
		}
		if (request.method !== 'POST' || !path.startsWith(service)) return problem(404, 'not_found')
		const method = path.slice(service.length)
		if (method === 'ListPlans') return Response.json({ salesOpen: true })
		const cookies = (request.headers.get('cookie') ?? '').split(/; */)
		if (!cookies.includes(`puzzled_session=${fixtureToken}`)) return problem(401, 'unauthenticated')
		const body = await request.json()
		calls.push({ method, body })
		switch (method) {
			case 'ClaimCheckout':
				if (body.checkoutSessionId !== 'fixture_checkout_delayed')
					return Response.json({ claimed: false })
				if (claimed) return Response.json({ claimed: false })
				if (calls.filter((item) => item.method === 'ClaimCheckout').length < 2)
					return Response.json({ claimed: false })
				claimed = true
				return Response.json(
					{ claimed: true },
					{ headers: { 'Set-Cookie': 'puzzled_checkout_claim=; Path=/; Max-Age=0; HttpOnly' } },
				)
			case 'GetSubscription':
				if (cookies.includes('__Host-puzzled_guest=unavailable')) return problem(503, 'unavailable')
				if (body.checkoutSessionId === 'fixture_checkout_delayed' && !claimed)
					return Response.json({ salesOpen: true })
				if (body.checkoutSessionId === 'fixture_checkout_pass')
					return Response.json({
						salesOpen: true,
						entitled: true,
						source: 'plus',
						settledCheckout: { orderId: 'pi_starter_fixture', amountMinor: '350', currency: 'JPY' },
					})
				return Response.json({
					salesOpen: true,
					entitled: true,
					source: 'plus',
					planId: 'family_yearly',
					status: 'active',
					...(body.checkoutSessionId === 'fixture_checkout_delayed' && claimed
						? {
								settledCheckout: {
									orderId: 'in_plus_fixture',
									amountMinor: '5999',
									currency: 'GBP',
								},
							}
						: {}),
					currentPeriodEndMs: periodEnd,
					cancelAtPeriodEnd: cancelled,
					family: {
						role: 'owner',
						maxMembers: 4,
						inviteCode,
						members: [
							{ userId: 'owner', owner: true, displayName: 'Fixture owner' },
							...(memberPresent
								? [{ userId: 'opaque-member', displayName: 'Fixture member' }]
								: []),
						],
					},
				})
			case 'CancelSubscription':
				cancelled = true
				return Response.json({ accessEndsAtMs: periodEnd })
			case 'ResumeSubscription':
				cancelled = false
				return Response.json({})
			case 'ResetFamilyInvite':
				inviteCode = 'new-fixture-invite'
				return Response.json({ inviteCode })
			case 'RemoveFamilyMember':
				if (body.userId !== 'opaque-member') return problem(403, 'permission_denied')
				memberPresent = false
				return Response.json({})
			default:
				return problem(404, 'not_found')
		}
	},
})
