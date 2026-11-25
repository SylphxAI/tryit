/** Local only: Auth response fixture for the real SolidStart routes. No credentials, email or accounts. */
import { readFileSync } from 'node:fs'
import { fixtureToken } from './auth-fixture-facts'

export const org = 'organization-00000000-0000-4000-8000-000000000123'
export const flow = 'A'.repeat(43)
const email = 'synthetic@example.test'
const user = {
	principal_id: 'fixture-user',
	project_id: org,
	primary_email: email,
	primary_email_verified: true,
}
const publishable = process.env.SYLPHX_PUBLISHABLE_KEY
const secret = process.env.SYLPHX_AUTH_SECRET_KEY
const fixtureTLS = process.env.FIXTURE_AUTH_TLS_DIR!
if (!fixtureTLS || !publishable || !secret)
	throw new Error('Fixture TLS and synthetic keys are required')
const response = (data: object, status = 200) => Response.json(data, { status })

function browserSession(id: string, name: string, state = 'active') {
	return {
		session_id: id,
		device: { display_name: name },
		created_at_unix_seconds: 1_773_000_000,
		expires_at_unix_seconds: 1_999_000_000,
		state,
	}
}

let tabletEnded = false
let mode = 'enabled'
let calls: { path: string; body: unknown }[] = []
let counter = 0
let tickets = new Set<string>()
const issue = () => {
	const ticket = `fixture-ticket-${++counter}`
	tickets.add(ticket)
	return response({ ticket })
}

Bun.serve({
	tls: { cert: readFileSync(`${fixtureTLS}/cert.pem`), key: readFileSync(`${fixtureTLS}/key.pem`) },
	hostname: '127.0.0.1',
	port: Number(process.env.FIXTURE_AUTH_PORT ?? 18875),
	async fetch(request) {
		const url = new URL(request.url)
		const path = url.pathname
		const auth = request.headers.get('authorization')
		const body = request.method === 'POST' ? await request.json().catch(() => null) : null
		if (path === '/__fixture') {
			if (request.method === 'POST') {
				mode = String(body?.mode)
				tabletEnded = false
				calls = []
				tickets = new Set()
			}
			return response({ calls })
		}
		calls.push({ path, body })
		// This fixture exposes no routes in the retired Auth namespace.
		if (path.startsWith('/v1/auth/')) return response({ code: 'not_found' }, 404)
		const enabled = !['legacy', 'off'].includes(mode)
		const pk = auth === `Bearer ${publishable}`
		if (path === '/v1/client/config') {
			if (!pk) return response({}, 403)
			return response({
				instance: { id: org, slug: 'tryit-test', environment: 'test' },
				methods: { email_otp: enabled, passkey: enabled, password: mode !== 'off' },
				social: mode === 'off' ? [] : [{ provider: 'google', credentials: 'shared' }],
			})
		}
		if (path === '/v1/client/oauth/google/start' && pk && mode === 'google') {
			const callback = new URL(url.searchParams.get('redirect_url') ?? '')
			if (
				callback.origin !== 'https://tryit.fun' ||
				!callback.searchParams.has('flow') ||
				url.searchParams.get('session_mode') !== 'server'
			)
				return response({}, 400)
			const { ticket } = await issue().json()
			callback.searchParams.set('auth_ticket', ticket)
			const next = new URL('https://accounts.google.com/o/oauth2/v2/auth')
			// The test intercepts the provider navigation and completes the fixture round trip.
			next.searchParams.set('state', callback.pathname + callback.search)
			return Response.redirect(next, 303)
		}
		if (
			path === '/v1/client/continue' &&
			pk &&
			enabled &&
			body?.method === 'email_otp' &&
			body.session_mode === 'server'
		) {
			return response({ step: 'email_otp', flow, expires_in: 600 })
		}
		if (path === '/v1/client/continue/verify' && pk && enabled && body?.flow === flow) {
			return body.code === '141421' ? issue() : response({ code: 'unauthorized' }, 401)
		}
		if (
			path === '/v1/client/sign-in/passkey/begin' &&
			pk &&
			enabled &&
			!Object.hasOwn(body, 'email')
		) {
			return response({
				challenge_id: 'fixture-ceremony',
				challenge: 'A'.repeat(43),
				rp_id: body.rp_id,
				allowed_credential_ids: [],
				expires_at: Math.floor(Date.now() / 1000) + 120,
			})
		}
		if (
			path === '/v1/client/sign-in/passkey/verify' &&
			pk &&
			enabled &&
			body.challenge_id === 'fixture-ceremony' &&
			body.session_mode === 'server'
		)
			return issue()
		if (path === '/v1/client/sign-in/password' && pk && body.password === 'old') return issue()
		if (
			path === '/v1/client/tickets:redeem' &&
			auth === `Bearer ${secret}` &&
			tickets.delete(body?.ticket)
		) {
			return response({
				session: { token: fixtureToken, expires_at: Math.floor(Date.now() / 1000) + 600 },
				user: { id: user.principal_id, email_verified: true },
				is_new_user: mode === 'new',
			})
		}
		if (
			path === '/v1/sessions/current' &&
			auth === `Bearer ${fixtureToken}` &&
			request.headers.get('x-sylphx-caller-key') === publishable
		) {
			if (mode === 'slow-session') await Bun.sleep(1250)
			return response({
				principal: user,
				session: browserSession('this-browser', 'Fixture Chromium'),
			})
		}
		if (auth === `Bearer ${fixtureToken}` && path === '/v1/sessions') {
			if (mode === 'sessions-unavailable') return response({}, 503)
			if (body?.cursor === 'page-two') {
				return response({
					sessions: [browserSession('older', 'Old phone', 'expired')],
					next_cursor: '',
				})
			}
			return response({
				sessions: [
					browserSession('this-browser', 'Fixture Chromium'),
					browserSession('tablet', 'Fixture tablet', tabletEnded ? 'revoked' : 'active'),
				],
				next_cursor: 'page-two',
			})
		}
		if (
			auth === `Bearer ${fixtureToken}` &&
			path === '/v1/sessions/tablet/revoke' &&
			body?.session_id === 'tablet'
		) {
			tabletEnded = true
			return response({ session: browserSession('tablet', 'Fixture tablet', 'revoked') })
		}
		if (auth === `Bearer ${fixtureToken}` && path === '/v1/client/sign-out') {
			return response({})
		}
		if (path === '/v1/consents' && request.method === 'POST') {
			if (auth !== `Bearer ${secret}`) return response({ code: 'unauthorized' }, 401)
			const timestamp = body?.occurred_at_unix_seconds
			if (
				!body ||
				Object.keys(body).length !== 7 ||
				typeof body.idempotency_key !== 'string' ||
				!/^[\da-f]{8}-[\da-f]{4}-7[\da-f]{3}-[89ab][\da-f]{3}-[\da-f]{12}$/.test(
					body.idempotency_key,
				) ||
				body.project_id !== org ||
				body.principal_id !== user.principal_id ||
				body.purpose !== 'necessary' ||
				body.state !== 'granted' ||
				body.legal_basis !== 'consent' ||
				!Number.isInteger(timestamp) ||
				Math.abs(Math.floor(Date.now() / 1000) - timestamp) > 10
			)
				return response({ code: 'invalid_consent' }, 400)
			if (mode === 'refuse-consent') return response({ code: 'forbidden' }, 403)
			return response({ consent: { consent_id: 'fixture-consent', fact: body } }, 201)
		}
		if (
			path === '/v1/signup/email-verification/complete' &&
			body?.challenge_id === 'issued' &&
			body.secret === 'fixture-proof'
		)
			return response({ verified: true })
		return response({ code: 'fixture_request_refused' }, 403)
	},
})
