import { env } from '@/lib/env'
import { signUpCookieHeader } from '@/lib/identity/after-sign-up'
import { authConfig, safeNext } from '@/lib/identity/client-auth'
import { issueSession } from '@/lib/identity/session-response'
import { completeSignIn } from '@/lib/identity/sign-in'

function oauthFailed() {
	return new Response(null, { status: 303, headers: { location: '/login?error=oauth_failed' } })
}

/**
 * Where Auth returns after a social sign-in, with `sylphx_ticket`. The ticket
 * is redeemed here (server mode) into the session cookie; a new account is
 * credited to the link that brought the player.
 */
export async function GET(request: Request) {
	const url = new URL(request.url)
	const next = safeNext(url.searchParams.get('next'))
	const ticket = url.searchParams.get('sylphx_ticket')?.trim()
	const config = authConfig()
	if (!config || !ticket) {
		return oauthFailed()
	}
	try {
		const { token, newAccount } = await completeSignIn(config, request, ticket)
		const response = new Response(null, { status: 303, headers: { location: next } })
		// Only Auth's own new-account answer sets the one-shot sign_up cookie.
		if (newAccount) response.headers.append('set-cookie', signUpCookieHeader('oauth'))
		return issueSession(response, token, env.NODE_ENV === 'production')
	} catch {
		return oauthFailed()
	}
}
