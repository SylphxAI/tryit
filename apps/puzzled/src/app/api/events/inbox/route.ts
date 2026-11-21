import { destEventsJson } from '@/lib/identity/peels'
import { currentUser } from '@/lib/identity/server'

export async function GET() {
	const user = await currentUser()
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
