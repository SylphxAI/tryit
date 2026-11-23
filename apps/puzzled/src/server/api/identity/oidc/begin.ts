import { AuthCallError, authConfig, googleStartUrl, safeNext } from '@/lib/identity/client-auth'
import { admitJsonPost, requestUserAgent } from '@/lib/identity/http'
import { isPolicyAcceptance } from '@/lib/identity/policy-consent'
import { authFail } from '@/lib/identity/sign-in'
import { requestSiteOrigin } from '@/lib/site-origin-request'

/** Auth owns the provider round trip and returns a one-time ticket. */
export async function POST(request: Request) {
	const refused = await admitJsonPost(request)
	if (refused) return refused
	const config = authConfig()
	if (!config) return authFail(503, 'identity_unconfigured')
	const body = (await request.json().catch(() => null)) as {
		acceptance?: unknown
		provider?: unknown
		federationId?: unknown
		redirectUrl?: unknown
	} | null
	const acceptance = body?.acceptance
	if (acceptance !== undefined && !isPolicyAcceptance(acceptance))
		return authFail(400, 'policy_acceptance_required')
	const provider = body?.provider ?? body?.federationId
	if (typeof provider !== 'string' || provider.trim().toLowerCase() !== 'google')
		return authFail(400, 'oidc_provider_unsupported')
	const next = safeNext(typeof body?.redirectUrl === 'string' ? body.redirectUrl : undefined)
	let callback: URL
	try {
		callback = new URL('/api/identity/oauth/callback', requestSiteOrigin(request.headers))
		callback.searchParams.set('next', next)
	} catch {
		return authFail(400, 'invalid_request_origin')
	}
	try {
		const authorizationUrl = await googleStartUrl(
			config,
			callback.href,
			requestUserAgent(request),
			acceptance,
		)
		return Response.json({ authorizationUrl }, { headers: { 'cache-control': 'no-store' } })
	} catch (error) {
		if (error instanceof AuthCallError && error.code === 'oidc_provider_unavailable')
			return authFail(403, 'oidc_provider_unavailable')
		return authFail(502, 'oidc_begin_failed')
	}
}
