import { env } from '@/lib/env'
import { signUpCookieHeader } from '@/lib/identity/after-sign-up'
import {
	AuthCallError,
	type AuthConfig,
	authClient,
	authConfig,
	clientMethods,
} from '@/lib/identity/client-auth'
import { admitJsonPost } from '@/lib/identity/http'
import { issueSession } from '@/lib/identity/session-response'
import { completeSignIn, userAgentOf } from '@/lib/identity/sign-in'
import { requestSiteOrigin } from '@/lib/site-origin-request'

function json(body: unknown, status = 200) {
	return Response.json(body, { status, headers: { 'cache-control': 'private, no-store' } })
}

export async function GET(request: Request) {
	const config = authConfig()
	if (!config) return json({ error: 'identity_unconfigured' }, 503)
	try {
		const { emailCode, ...methods } = await clientMethods(config, userAgentOf(request))
		return json({ ...methods, emailOtp: emailCode })
	} catch {
		return json({ error: 'identity_unavailable' }, 503)
	}
}

const text = (value: unknown, limit: number): string =>
	typeof value === 'string' && value.length <= limit ? value : ''

export async function POST(request: Request) {
	const refused = await admitJsonPost(request)
	if (refused) return refused
	const config = authConfig()
	if (!config) return json({ error: 'identity_unconfigured' }, 503)
	const body = (await request.json().catch(() => null)) as Record<string, unknown> | null
	const userAgent = userAgentOf(request)
	const email = text(body?.email, 254).trim()
	const invalid = () => json({ error: 'invalid_request' }, 400)

	async function finish(config: AuthConfig, path: string, input: unknown, canCreate = false) {
		const { ticket } = await authClient<{ ticket?: string }>(config, path, userAgent, input)
		if (typeof ticket !== 'string' || !ticket) return json({ error: 'identity_unavailable' }, 502)
		const { token, newAccount } = await completeSignIn(config, request, ticket)
		const response = json({ signedIn: true })
		if (canCreate && newAccount) response.headers.append('set-cookie', signUpCookieHeader('email'))
		return issueSession(response, token, env.NODE_ENV === 'production')
	}

	try {
		switch (body?.action) {
			case 'continue': {
				if (!email || (body.method !== undefined && body.method !== 'email_otp')) return invalid()
				const step = await authClient<{ step: string; flow?: string }>(
					config,
					'continue',
					userAgent,
					{
						email,
						session_mode: 'server',
						...(body.method === 'email_otp' ? { method: 'email_otp' } : {}),
					},
				)
				if (step.step === 'password') return json({ step: 'password' })
				if (step.step === 'email_otp' && typeof step.flow === 'string' && step.flow) {
					return json({ step: 'email_otp', flow: step.flow })
				}
				return json({ error: 'identity_unavailable' }, 502)
			}
			case 'verify-code': {
				const flow = text(body.flow, 256)
				const code = text(body.code, 6)
				if (!flow || !/^\d{6}$/.test(code)) return invalid()
				return await finish(config, 'continue/verify', { flow, code }, true)
			}
			case 'begin-passkey': {
				// RP ID and origin come from this deployment, never from the JSON body.
				const origin = new URL(requestSiteOrigin(request.headers))
				const result = await authClient<{
					challenge_id: string
					challenge: string
					rp_id: string
					allowed_credential_ids?: string[]
				}>(config, 'sign-in/passkey/begin', userAgent, {
					rp_id: origin.hostname,
					origin: origin.origin,
					...(email ? { email } : {}),
				})
				return json({
					challengeId: result.challenge_id,
					challenge: result.challenge,
					rpId: result.rp_id,
					allowCredentials: result.allowed_credential_ids ?? [],
				})
			}
			case 'verify-passkey': {
				const assertion = {
					challenge_id: text(body.challengeId, 256),
					credential_id: text(body.credentialId, 4096),
					client_data_json: text(body.clientDataJSON, 4096),
					authenticator_data: text(body.authenticatorData, 4096),
					signature: text(body.signature, 4096),
				}
				if (Object.values(assertion).some((value) => !value)) return invalid()
				return await finish(config, 'sign-in/passkey/verify', {
					...assertion,
					user_handle: text(body.userHandle, 512),
					session_mode: 'server',
				})
			}
			default:
				return invalid()
		}
	} catch (error) {
		if (error instanceof AuthCallError) {
			if (error.status === 429) {
				const response = json({ error: 'rate_limited' }, 429)
				if (error.retryAfter) response.headers.set('retry-after', error.retryAfter)
				return response
			}
			if (error.code === 'mfa_required') return json({ error: 'mfa_required' }, 401)
			if (error.status === 401 || error.status === 403)
				return json({ error: 'identity_rejected' }, error.status)
		}
		return json({ error: 'identity_unavailable' }, 503)
	}
}
