import { cookies, headers } from 'next/headers'
import type { IdentityUser } from './dest'
import { resolveUser } from './request-identity'
import { readSessionToken } from './session-cookie'

export type { IdentityUser }

export async function sessionToken(): Promise<string | undefined> {
	return readSessionToken(await cookies())
}

export async function currentUser(): Promise<IdentityUser | null> {
	const [token, requestHeaders] = await Promise.all([sessionToken(), headers()])
	return resolveUser(token, requestHeaders.get('user-agent')?.trim() || 'puzzled-web')
}

export async function auth(): Promise<{
	user: IdentityUser | null
	sessionToken?: string
	userId?: string
}> {
	const user = await currentUser()
	const token = await sessionToken()
	return { user, sessionToken: token, userId: user?.id }
}
