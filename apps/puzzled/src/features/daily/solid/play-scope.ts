import { uuidv7 } from '@sylphx/sdk/runtime'
import { getRequestEvent } from 'solid-js/web'
import { DAILY_PLAY_DRAFT_TAB_KEY } from '@/lib/storage-keys'

const isNonce = (value: string) =>
	/^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(value)

/** Use a tab-local salt so the scope can survive reload but cannot link tabs. */
export async function readPlayDraftScope(): Promise<string | undefined> {
	let timeout: number | undefined
	try {
		let nonce = sessionStorage.getItem(DAILY_PLAY_DRAFT_TAB_KEY)
		if (!nonce || !isNonce(nonce)) {
			nonce = uuidv7()
			sessionStorage.setItem(DAILY_PLAY_DRAFT_TAB_KEY, nonce)
		}
		return await Promise.race([
			readPlayScope(nonce),
			new Promise<undefined>((resolve) => {
				timeout = window.setTimeout(resolve, 2000)
			}),
		])
	} catch {
		return undefined // Unknown owner: play normally, but do not read or write a draft.
	} finally {
		window.clearTimeout(timeout)
	}
}

/** Uncached scope for local state only. Never expose or authorize with a player ID or cookie. */
export async function readPlayScope(nonce: string): Promise<string | undefined> {
	'use server'
	const event = getRequestEvent()
	if (!event || !isNonce(nonce)) return undefined
	event.response.headers.set('Cache-Control', 'private, no-store')
	const { progressCredentialCookies } = await import('@/lib/api/request-connect')
	const cookies = progressCredentialCookies(event.request.headers).sort()
	if (!cookies.length) return undefined
	const { createHash } = await import('node:crypto')
	return createHash('sha256')
		.update(JSON.stringify(['play-scope-v1', nonce, cookies]))
		.digest('hex')
}
