import 'server-only'

import {
	AuthCallError,
	type AuthConfig,
	isNewUser,
	redeemTicket,
	sessionTimes,
} from './client-auth'
import { destIdentityProjectId } from './credentials'
import { requestUserAgent } from './request-identity'
import { recordSignupAttribution } from './signup-attribution'

export function authFail(status: number, error: string) {
	return Response.json({ error }, { status })
}

export { requestUserAgent as userAgentOf }

/**
 * Redeem a sign-in ticket for the response to store in its session cookie. When the account is new,
 * credit the link that brought the player (first-touch tags). Returns the
 * session token and whether Auth says the account is new, or throws
 * `AuthCallError`.
 */
export async function completeSignIn(
	config: AuthConfig,
	request: Request,
	ticket: string,
): Promise<{ token: string; newAccount: boolean }> {
	const userAgent = requestUserAgent(request)
	const session = await redeemTicket(config, ticket, userAgent)
	let newAccount = false
	try {
		const times =
			typeof session.isNewUser === 'boolean'
				? {}
				: await sessionTimes(config, session.token, userAgent, destIdentityProjectId())
		if (isNewUser({ flag: session.isNewUser, ...times, now: Date.now() / 1000 })) {
			newAccount = true
			await recordSignupAttribution(session.token, request.headers.get('cookie'), userAgent)
		}
	} catch (error) {
		// Attribution never blocks a sign-in.
		if (!(error instanceof AuthCallError)) throw error
	}
	return { token: session.token, newAccount }
}
