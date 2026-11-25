import { env } from '@/lib/env'
import { signUpCookieHeader } from '@/lib/identity/after-sign-up'
import {
	AuthCallError,
	type AuthConfig,
	authConfig,
	beginEmailCode,
	beginPasskey,
	emailCodeTicket,
	type PasskeyProof,
	passkeyTicket,
} from '@/lib/identity/client-auth'
import { emailProblem } from '@/lib/identity/form-validation'
import { admitJsonPost } from '@/lib/identity/http'
import { isPolicyAcceptance } from '@/lib/identity/policy-consent'
import { recordPolicyAcceptance } from '@/lib/identity/policy-consent-server'
import { resolveUser } from '@/lib/identity/request-identity'
import { issueSession } from '@/lib/identity/session-response'
import { completeSignIn, userAgentOf } from '@/lib/identity/sign-in'
import { isLoopbackHostname } from '@/lib/site-origin'
import { requestSiteOrigin } from '@/lib/site-origin-request'

function reply(body: object, status = 200, retryAfter?: string | null) {
	const headers = new Headers({ 'cache-control': 'no-store' })
	if (retryAfter && /^\d{1,8}$/.test(retryAfter)) headers.set('retry-after', retryAfter)
	return Response.json(body, { status, headers })
}

function refusal(error: string, status: number, retryAfter?: string | null) {
	return reply({ error }, status, retryAfter)
}

function proofFrom(body: Record<string, unknown>): PasskeyProof | null {
	const {
		challenge_id,
		credential_id,
		client_data_json,
		authenticator_data,
		signature,
		user_handle,
	} = body
	const challengeId =
		typeof challenge_id === 'string' && /^[\w-]{1,256}$/.test(challenge_id) ? challenge_id : null
	const encoded = (value: unknown): value is string =>
		typeof value === 'string' && /^[A-Za-z0-9_-]{1,4096}$/.test(value)
	if (
		!challengeId ||
		!encoded(credential_id) ||
		!encoded(client_data_json) ||
		!encoded(authenticator_data) ||
		!encoded(signature) ||
		!(user_handle === '' || encoded(user_handle))
	)
		return null
	return {
		challenge_id: challengeId,
		credential_id,
		client_data_json,
		authenticator_data,
		signature,
		user_handle,
	}
}

async function finish(config: AuthConfig, request: Request, ticket: string, viaEmail: boolean) {
	const { token, newAccount } = await completeSignIn(config, request, ticket)
	const userAgent = userAgentOf(request)
	// Continue verifies the inbox and may create an account; it doesn't accept policy fields.
	// Bind the explicit acceptance to the actual verified session before releasing the cookie.
	const user = await resolveUser(token, userAgent)
	if (!user) return refusal('sign_in_unavailable', 502)
	await recordPolicyAcceptance(user.id)
	const response = reply({ signedIn: true, newAccount: viaEmail && newAccount })
	if (viaEmail && newAccount) response.headers.append('set-cookie', signUpCookieHeader('email'))
	// In particular, do not replace or expire the existing guest or checkout claim cookie.
	return issueSession(response, token, env.NODE_ENV === 'production')
}

export async function POST(request: Request) {
	const refused = await admitJsonPost(request)
	if (refused) return refused
	// This is a browser-only credential and email-delivery door. Retain browser
	// provenance; do not claim the configured product origin on a caller's behalf.
	let site: URL
	try {
		site = new URL(requestSiteOrigin(request.headers))
	} catch {
		return refusal('forbidden_origin', 403)
	}
	if (request.headers.get('origin') !== site.origin) return refusal('forbidden_origin', 403)
	const config = authConfig()
	if (!config) return refusal('identity_unconfigured', 503)
	const body = (await request.json().catch(() => null)) as Record<string, unknown> | null
	const userAgent = userAgentOf(request)
	try {
		switch (body?.step) {
			case 'email-start': {
				const email = typeof body.email === 'string' ? body.email.trim() : ''
				if (email.length > 320 || emailProblem(email)) return refusal('invalid_email', 400)
				return reply(await beginEmailCode(config, userAgent, email))
			}
			case 'email-verify': {
				if (!isPolicyAcceptance(body.acceptance)) return refusal('policy_acceptance_required', 400)
				const { flow, code } = body
				if (
					typeof flow !== 'string' ||
					!/^[A-Za-z0-9_-]{43}$/.test(flow) ||
					typeof code !== 'string' ||
					!/^\d{6}$/.test(code)
				)
					return refusal('invalid_proof', 400)
				return await finish(
					config,
					request,
					await emailCodeTicket(config, userAgent, { flow, code }),
					true,
				)
			}
			case 'passkey-start':
				if (site.protocol !== 'https:' && !isLoopbackHostname(site.hostname)) {
					return refusal('passkey_unavailable', 403)
				}
				return reply(await beginPasskey(config, userAgent, site))
			case 'passkey-verify': {
				if (!isPolicyAcceptance(body.acceptance)) return refusal('policy_acceptance_required', 400)
				const proof = proofFrom(body)
				if (!proof) return refusal('invalid_proof', 400)
				return await finish(config, request, await passkeyTicket(config, userAgent, proof), false)
			}
			default:
				return refusal('invalid_sign_in_step', 400)
		}
	} catch (error) {
		if (error instanceof AuthCallError) {
			if (error.status === 429) return refusal('rate_limited', 429, error.retryAfter)
			if (error.code === 'mfa_required') return refusal('mfa_required', 401)
			if (error.status === 401) return refusal('proof_rejected', 401)
			if (error.status === 403) return refusal('method_unavailable', 403)
		}
		return refusal('sign_in_unavailable', 502)
	}
}
