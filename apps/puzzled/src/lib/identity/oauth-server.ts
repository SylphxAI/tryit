import 'server-only'

import { createHmac } from 'node:crypto'
import { createSylphxAuthHandler } from '@sylphx/auth'
import type { EntryConfig } from '@sylphx/auth/client'
import { env } from '@/lib/env'
import { PRODUCTION_SITE_ORIGIN } from '@/lib/site-origin'
import { safeCallbackPath, signUpCookieHeader } from './after-sign-up'
import { authConfig } from './client-auth'
import { authIdValue } from './dest'
import { OAUTH_ACCEPTANCE, OAUTH_PREFIX } from './oauth-contract'
import { isAcceptedPrivacyVersion } from './policy-consent'
import { requestUserAgent, resolveUser } from './request-identity'
import { LEGACY_SESSION_COOKIE, SESSION_COOKIE } from './session-cookie'
import { expiredSessionCookie } from './session-response'
import { recordSignupAttribution } from './signup-attribution'

const TRYIT_AUTH_PORTAL = 'https://auth.tryit.fun'

function unavailable() {
	return Response.json(
		{ error: 'unavailable' },
		{ status: 503, headers: { 'cache-control': 'private, no-store' } },
	)
}

// Keep the SDK's expected authority independent of request headers.
function oauthOrigin(): string {
	return env.SYLPHX_PUBLIC_URL || PRODUCTION_SITE_ORIGIN
}

export async function handleOAuth(request: Request): Promise<Response> {
	const config = authConfig()
	const instanceId = authIdValue(config?.instanceId)
	if (!config || !instanceId) return unavailable()
	try {
		let newAccount = false
		const handle = createSylphxAuthHandler({
			origin: oauthOrigin(),
			trustSylphxEdge: true,
			authApiOrigin: config.url,
			publishableKey: config.publishableKey,
			sessionMode: 'server',
			sessionSecret: config.secretKey,
			tenantAuthOrigin: TRYIT_AUTH_PORTAL,
			routePrefix: OAUTH_PREFIX,
			loginPath: '/sign-in',
			providers: ['google'],
			allowPasswordRegistration: false,
			allowReturnTo: (path) => safeCallbackPath(path) !== null,
			clickwrap: {
				// Use a domain-separated key, stable across replicas without passing the
				// Auth service credential to the flow-cookie signer.
				signingKey: createHmac('sha256', config.secretKey)
					.update('tryit/oauth/clickwrap/v1')
					.digest('base64url'),
				validate: (versions) =>
					Object.keys(versions).length === 2 &&
					versions.terms_version === OAUTH_ACCEPTANCE.terms_version &&
					isAcceptedPrivacyVersion(versions.privacy_version),
			},
			fetch: async (url, init) => {
				// Keep discovery pinned to the deployed instance ID as well as its Access key.
				const response = await fetch(url, init)
				if (url.origin === config.url && url.pathname === '/v1/client/config' && response.ok) {
					const settings = (await response.json()) as { instance?: { id?: unknown } }
					const id = settings?.instance?.id
					if (typeof id !== 'string' || authIdValue(id) !== instanceId) return unavailable()
					return Response.json(settings)
				}
				return response
			},
			session: {
				async issue(session, browser) {
					if (session.method !== 'oauth') return undefined
					// Identity's ticket contract supplies Unix seconds. The Rust RPC server
					// still consumes puzzled_session, so retain that cookie name.
					const expires = session.expiresAt
					if (
						typeof expires !== 'number' ||
						!Number.isSafeInteger(expires) ||
						expires <= Date.now() / 1000
					)
						return undefined
					const userAgent = requestUserAgent(browser)
					const user = await resolveUser(session.token, userAgent)
					if (!user?.emailVerified || user.id !== session.user.id) return undefined
					if (session.isNewUser)
						await recordSignupAttribution(session.token, browser.headers, userAgent)
					const age = expires - Math.ceil(Date.now() / 1000)
					if (age < 1) return undefined
					newAccount = session.isNewUser
					return [[SESSION_COOKIE, session.token, age]]
				},
				// The public handler only mounts config/start/callback. Settings still
				// revokes via the app's existing logout route and clears both names.
				async logout() {
					return new Response(null, { status: 404 })
				},
			},
		})
		const response = await handle(request)
		if (response.headers.getSetCookie().some((cookie) => cookie.startsWith(`${SESSION_COOKIE}=`))) {
			response.headers.append('set-cookie', expiredSessionCookie(LEGACY_SESSION_COOKIE, true))
			if (newAccount) response.headers.append('set-cookie', signUpCookieHeader('oauth'))
		}
		return response
	} catch {
		return unavailable()
	}
}

export async function readEntryConfig(request: Request): Promise<EntryConfig | null> {
	const headers = new Headers()
	const userAgent = request.headers.get('user-agent')
	if (userAgent) headers.set('user-agent', userAgent)
	const response = await handleOAuth(
		new Request(new URL(`${OAUTH_PREFIX}/config`, oauthOrigin()), {
			headers,
			signal: request.signal,
		}),
	)
	return response.ok ? ((await response.json()) as EntryConfig) : null
}
