import { admitJsonPost, admitSameOrigin, identityFail, requestUserAgent } from '@/lib/identity/http'
import { isPolicyAcceptance, POLICY_ACCEPTANCE } from '@/lib/identity/policy-consent'
import { policyConsentRequest } from '@/lib/identity/policy-consent-server'
import { requestSessionToken, requestUser } from '@/lib/identity/request-identity'

async function consent(request: Request, accept: boolean) {
	const refused = accept ? await admitJsonPost(request) : await admitSameOrigin(request)
	if (refused) return refused
	if (accept && !isPolicyAcceptance(await request.json().catch(() => null)))
		return identityFail(400, 'policy_acceptance_required')
	try {
		const token = requestSessionToken(request)
		if (!token) return identityFail(401, 'not_authenticated')
		const user = await requestUser(request)
		if (!user) return identityFail(401, 'not_authenticated')
		const status = await policyConsentRequest(
			token,
			user.id,
			requestUserAgent(request),
			accept ? POLICY_ACCEPTANCE : undefined,
		)
		return Response.json(status, { headers: { 'cache-control': 'no-store' } })
	} catch {
		return identityFail(502, 'policy_consent_unavailable')
	}
}
export const GET = (request: Request) => consent(request, false)
export const POST = (request: Request) => consent(request, true)
