/** Local only: Auth response fixture for the real SolidStart routes. No credentials, email or accounts. */
import { POLICY_ACCEPTANCE } from '../src/lib/identity/policy-consent'
import { fixtureToken } from './auth-fixture-facts'

export const org = 'organization-00000000-0000-4000-8000-000000000123'
export const flow = 'A'.repeat(43)
const email = 'synthetic@example.test'
const user = { principal_id: 'fixture-user', project_id: org, primary_email: email }
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
		const enabled = !['legacy', 'off'].includes(mode)
		if (path === '/v1/client/config') {
			if (url.searchParams.get('publishable_key') !== 'pk_local_fixture') return response({}, 403)
			return response({
				methods: { email_otp: enabled, passkey: enabled, password: mode !== 'off' },
				social: mode === 'off' ? [] : [{ provider: 'google' }],
			})
		}
		const pk = auth === 'Bearer pk_local_fixture'
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
			auth === 'Bearer sk_local_fixture' &&
			tickets.delete(body?.ticket)
		) {
			return response({ session: { token: fixtureToken }, is_new_user: mode === 'new' })
		}
		if (
			path === '/v1/sessions/current' &&
			auth === `Bearer ${fixtureToken}` &&
			request.headers.get('x-sylphx-caller-key') === 'pk_local_fixture'
		) {
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
		if (
			path === '/v1/auth/consent:accept' &&
			auth === `Bearer ${fixtureToken}` &&
			request.headers.get('x-sylphx-organization') === org
		) {
			if (
				mode === 'refuse-consent' ||
				!Object.entries(POLICY_ACCEPTANCE).every(([k, v]) => body?.[k] === v)
			)
				return response({}, 403)
			return response({
				user_id: user.principal_id,
				current_terms_version: body.terms_version,
				current_privacy_version: body.privacy_version,
				accepted_terms_version: body.terms_version,
				accepted_privacy_version: body.privacy_version,
				accepted_at: new Date().toISOString(),
				needs_reconsent: false,
			})
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
