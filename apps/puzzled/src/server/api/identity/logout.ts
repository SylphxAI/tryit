import { env } from '@/lib/env'
import { admitSameOrigin } from '@/lib/identity/http'
import { endRequestSession } from '@/lib/identity/request-identity'
import { expireSessions } from '@/lib/identity/session-response'

export async function POST(request: Request) {
	const refused = await admitSameOrigin(request)
	if (refused) return refused
	await endRequestSession(request)
	return expireSessions(Response.json({}), env.NODE_ENV === 'production')
}
