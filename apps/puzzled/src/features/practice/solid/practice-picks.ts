import { getRequestEvent } from 'solid-js/web'

/** Read the paywall's analytics dimension without adopting guest progress. */
export async function readPracticePicks(isGuest: boolean) {
	'use server'
	const event = getRequestEvent()
	if (!event) return undefined
	event.response.headers.set('Cache-Control', 'private, no-store')
	const { createClient } = await import('@connectrpc/connect')
	const { PuzzleService } = await import('@/gen/connect/puzzled/v1/puzzle_pb')
	const { progressCredentialCookies, requestConnectTransport } = await import(
		'@/lib/api/request-connect'
	)
	const { claimedDailyPicks, dailyPickCount } = await import('@/features/daily/lib/daily-picks')
	const { productDayKey } = await import('@/lib/product-day')
	const headers = new Headers(event.request.headers)
	const cookies = progressCredentialCookies(headers).filter(
		(pair) => pair.startsWith('__Host-puzzled_guest=') === isGuest,
	)
	headers.delete('cookie')
	if (cookies.length) headers.set('cookie', cookies.join('; '))
	const progress = await createClient(
		PuzzleService,
		requestConnectTransport(headers),
	).getTodayProgress({})
	const picks = claimedDailyPicks(progress, productDayKey())
	return picks ? dailyPickCount(picks) : undefined
}
