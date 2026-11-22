import { createHash } from 'node:crypto'
import { env } from '../env'
import { requestSiteOrigin } from '../site-origin-request'
import { DestHttpError, destIdentityJson, destIdentityOrigin } from './dest'
import { identityDestAdmission } from './request-identity'

export { requestUserAgent } from './request-identity'

export function identityFail(status: number, error: string) {
	return Response.json({ error }, { status })
}

export function identityOrigin(): string {
	return destIdentityOrigin(env.SYLPHX_AUTH_URL)
}

export function destDevice(request: Request) {
	return {
		device_id: 'puzzled-web',
		display_name: 'Tryit',
		user_agent: request.headers.get('user-agent')?.trim() || 'puzzled-web',
	}
}

export function destAdmissionResponse():
	| { ok: true; origin: string; credential: string; projectId: string }
	| { ok: false; response: Response } {
	try {
		return { ok: true, ...identityDestAdmission() }
	} catch (error) {
		const message = error instanceof Error ? error.message : 'identity_unconfigured'
		const errorCode = [
			'identity_credential_unconfigured',
			'identity_project_unconfigured',
		].includes(message)
			? message
			: 'identity_unconfigured'
		console.warn('identity admission unconfigured', { error: errorCode })
		return { ok: false, response: identityFail(503, errorCode) }
	}
}

export async function destIdentityCall<T>(
	path: string,
	init: {
		method?: string
		credential?: string
		body?: unknown
		headers?: Record<string, string>
		signal?: AbortSignal
	} = {},
): Promise<T> {
	return destIdentityJson<T>(identityOrigin(), path, init)
}

/**
 * Same-origin admission for a mutating identity route. A browser always sends
 * `Origin` on a cross-site POST, so a present `Origin` must be this site (the
 * request's own origin or the configured site origin); `Sec-Fetch-Site:
 * cross-site` is refused too. A request with neither header (a server client)
 * has no ambient browser credentials to abuse and passes.
 */
export async function admitSameOrigin(request: Request): Promise<Response | null> {
	if (request.headers.get('sec-fetch-site') === 'cross-site') {
		return identityFail(403, 'forbidden_origin')
	}
	const origin = request.headers.get('origin')
	if (origin && origin !== new URL(request.url).origin) {
		try {
			if (origin === requestSiteOrigin(request.headers)) return null
		} catch {
			// Invalid or missing public authority cannot admit a browser write.
		}
		return identityFail(403, 'forbidden_origin')
	}
	return null
}

/** Same-origin admission plus a JSON body: the guard for every JSON identity POST. */
export async function admitJsonPost(request: Request): Promise<Response | null> {
	const refused = await admitSameOrigin(request)
	if (refused) return refused
	if (!(request.headers.get('content-type') ?? '').toLowerCase().startsWith('application/json')) {
		return identityFail(415, 'json_required')
	}
	return null
}

/**
 * One retry key per command: the same inputs always give the same key, so a
 * transport retry replays at Auth instead of running twice, while a different
 * secret or password is a different command. Only the hash leaves the process.
 */
export function derivedIdempotencyKey(...parts: string[]): string {
	return createHash('sha256').update(parts.join('\0')).digest('hex').slice(0, 32)
}

/** Password length as Auth counts it: UTF-8 bytes, 12..1024. */
export function passwordByteLengthOk(password: string): boolean {
	const bytes = new TextEncoder().encode(password).length
	return bytes >= 12 && bytes <= 1024
}

/** A 429 from Auth, with its Retry-After, or null for any other failure. */
export function rateLimitedResponse(error: unknown): Response | null {
	if (!(error instanceof DestHttpError) || error.status !== 429) return null
	const response = identityFail(429, 'rate_limited')
	if (error.retryAfter) response.headers.set('retry-after', error.retryAfter)
	return response
}

export { DestHttpError }
