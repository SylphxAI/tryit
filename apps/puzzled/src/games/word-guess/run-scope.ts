import { getRequestEvent } from 'solid-js/web'

let documentNonce: string | undefined

/** Never returns a player ID or a credential, and never uses the router cache. */
export function readFiveRunScope(): Promise<string | undefined> {
	documentNonce ??= crypto.randomUUID()
	return readScope(documentNonce)
}

async function readScope(nonce: string): Promise<string | undefined> {
	'use server'
	const event = getRequestEvent()
	if (!event || !/^[0-9a-f-]{36}$/.test(nonce)) return undefined
	event.response.headers.set('Cache-Control', 'private, no-store')
	const { progressCredentialCookies } = await import('@/lib/api/request-connect')
	const cookies = progressCredentialCookies(event.request.headers)
	if (cookies.length === 0) return undefined
	const { createHash } = await import('node:crypto')
	return createHash('sha256')
		.update(JSON.stringify(['five-navigation-v1', nonce, cookies]))
		.digest('hex')
}
