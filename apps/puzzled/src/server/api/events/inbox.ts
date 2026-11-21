import { destEventsJson } from '@/lib/identity/peels'
import { requestUser } from '@/lib/identity/request-identity'

export async function GET(request: Request) {
	const user = await requestUser(request)
	if (!user) {
		return Response.json({ messages: [] })
	}
	try {
		const body = await destEventsJson<{ messages?: unknown[] }>('/v1/inbox', {
			method: 'GET',
		})
		return Response.json({ messages: body.messages ?? [] })
	} catch (error) {
		const message = error instanceof Error ? error.message : 'events_inbox_failed'
		return Response.json({ error: message }, { status: 502 })
	}
}
