import 'server-only'

import { requestUser } from './request-identity'
import { readSessionToken } from './session-cookie'

const SESSION_VERIFICATION_TIMEOUT_MS = 3000

/** Verify nav state with Auth. Guests/probes never start the Auth lookup or its timer. */
export async function readSignedIn(request: Request): Promise<boolean> {
	if (!readSessionToken(request)) return false
	// Auth is a separate HTTPS service; don't reuse the shorter internal Connect budget.
	return Boolean(await requestUser(request, AbortSignal.timeout(SESSION_VERIFICATION_TIMEOUT_MS)))
}
