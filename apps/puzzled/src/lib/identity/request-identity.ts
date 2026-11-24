import 'server-only'

import { env } from '../env'
import { destIdentityCredential, destIdentityProjectId, destProductCredential } from './credentials'
import { destIdentityJson, destIdentityOrigin, destIdentityUser, type IdentityUser } from './dest'
import { readSessionToken } from './session-cookie'

export { readSessionToken as requestSessionToken }

/** Auth binds the session to the original browser's User-Agent. */
export function requestUserAgent(request: Request): string {
	return request.headers.get('user-agent')?.trim() || 'puzzled-web'
}

export function requestUser(request: Request): Promise<IdentityUser | null> {
	return resolveUser(readSessionToken(request), requestUserAgent(request))
}

export async function resolveUser(
	token: string | undefined,
	userAgent: string,
): Promise<IdentityUser | null> {
	if (!token) return null
	// Auth requires the product's publishable key on every session read.
	const callerKey = destProductCredential(['SYLPHX_PUBLISHABLE_KEY'])
	if (!callerKey) return null
	try {
		const current = await destIdentityJson(
			destIdentityOrigin(env.SYLPHX_AUTH_URL),
			'/v1/sessions/current',
			{
				credential: token,
				headers: { 'user-agent': userAgent, 'x-sylphx-caller-key': callerKey },
			},
		)
		return destIdentityUser(current, destIdentityProjectId())
	} catch {
		return null
	}
}

export async function endRequestSession(request: Request): Promise<void> {
	const token = readSessionToken(request)
	if (!token) return
	try {
		await destIdentityJson(destIdentityOrigin(env.SYLPHX_AUTH_URL), '/v1/client/sign-out', {
			method: 'POST',
			credential: token,
			headers: { 'user-agent': requestUserAgent(request) },
		})
	} catch {
		// Sign-out is best-effort upstream; clearing the browser cookie is local.
	}
}

export function identityDestAdmission(): {
	origin: string
	credential: string
	projectId: string
} {
	const credential = destIdentityCredential()
	const projectId = destIdentityProjectId()
	if (!credential) throw new Error('identity_credential_unconfigured')
	if (!projectId) throw new Error('identity_project_unconfigured')
	return { origin: destIdentityOrigin(env.SYLPHX_AUTH_URL), credential, projectId }
}
