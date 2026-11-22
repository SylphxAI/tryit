import { uuidv7 } from '@sylphx/sdk/runtime'
import {
	admitSameOrigin,
	destIdentityCall,
	identityFail,
	rateLimitedResponse,
	requestUserAgent,
} from '@/lib/identity/http'
import { requestSessionToken } from '@/lib/identity/request-identity'
import { requestSiteOrigin } from '@/lib/site-origin-request'

/**
 * Send a new verification email to the signed-in player. The address is the
 * session's own: the caller names no email, so this cannot mail anyone else.
 * Auth needs the player's session and the browser's User-Agent.
 */
export async function POST(request: Request) {
	const refused = await admitSameOrigin(request)
	if (refused) return refused
	const token = requestSessionToken(request)
	if (!token) return identityFail(401, 'not_signed_in')
	try {
		await destIdentityCall('/v1/email-verification/start', {
			method: 'POST',
			credential: token,
			headers: { 'user-agent': requestUserAgent(request) },
			body: {
				idempotency_key: uuidv7(),
				redirect_url: `${requestSiteOrigin(request.headers)}/verify-email`,
			},
		})
		return Response.json({ accepted: true })
	} catch (error) {
		return rateLimitedResponse(error) ?? identityFail(502, 'identity_verification_unavailable')
	}
}
