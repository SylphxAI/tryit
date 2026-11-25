import { getRequestEvent } from 'solid-js/web'

/** Return only a presentation boolean; never expose a session token or player ID. */
export async function readPlayGuestStatus(): Promise<boolean | undefined> {
	'use server'
	const event = getRequestEvent()
	if (!event) return undefined
	event.response.headers.set('Cache-Control', 'private, no-store')
	const { hasAccountSessionCookie } = await import('@/lib/api/request-connect')
	return !hasAccountSessionCookie(event.request.headers)
}
