import { env } from '@/lib/env'
import { AuthCallError, authConfig, passwordTicket } from '@/lib/identity/client-auth'
import { admitJsonPost } from '@/lib/identity/http'
import { issueSession } from '@/lib/identity/session-response'
import { authFail, completeSignIn, userAgentOf } from '@/lib/identity/sign-in'

/** Email + password sign-in through the Auth client API (server mode). */
export async function POST(request: Request) {
	const refused = await admitJsonPost(request)
	if (refused) return refused
	const config = authConfig()
	if (!config) return authFail(503, 'identity_unconfigured')
	const body = (await request.json().catch(() => null)) as {
		email?: string
		password?: string
	} | null
	const email = body?.email?.trim()
	const password = body?.password ?? ''
	if (!email || !password) return authFail(400, 'invalid_login')
	try {
		const ticket = await passwordTicket(config, {
			email,
			password,
			userAgent: userAgentOf(request),
		})
		const { token } = await completeSignIn(config, request, ticket)
		return issueSession(Response.json({}), token, env.NODE_ENV === 'production')
	} catch (error) {
		if (error instanceof AuthCallError && error.status === 429) {
			return authFail(429, 'locked_out')
		}
		if (error instanceof AuthCallError && error.code === 'mfa_required') {
			return authFail(401, 'mfa_required')
		}
		return authFail(401, 'identity_rejected')
	}
}
