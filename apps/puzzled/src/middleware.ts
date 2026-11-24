import { createMiddleware } from '@solidjs/start/middleware'
import { googleTagIds } from '@/features/analytics/lib/google-tag'
import { dailyEntryRedirect } from '@/features/daily/lib/daily-entry'
import { legacyChallengeRedirect } from '@/features/identity/solid/challenge-redirect'
import { legacySignInRedirect } from '@/features/identity/solid/sign-in-redirect'
import { adsConfig } from '@/lib/ads'
import { buildCsp, createNonce } from '@/lib/csp'
import { env } from '@/lib/env'
import { canonicalPageRedirect, preferredPageRedirect } from '@/lib/i18n/page-redirect'
import { migratedSessionHeaders } from '@/lib/identity/session-response'
import { legacyPageRedirect, retiredOpenGraphImage } from '@/lib/legacy-page-redirect'
import { isProxySkippedPath } from '@/lib/proxy-paths'

export default createMiddleware({
	onRequest(event) {
		const nonce = createNonce()
		event.locals.cspNonce = nonce
		const headers = event.response.headers
		headers.set(
			'Content-Security-Policy',
			buildCsp(nonce, {
				dev: env.NODE_ENV === 'development',
				ads: adsConfig(env) !== null,
				googleTag: googleTagIds(env) !== null,
			}),
		)
		headers.set('X-Frame-Options', 'DENY')
		headers.set('X-Content-Type-Options', 'nosniff')
		headers.set('Referrer-Policy', 'strict-origin-when-cross-origin')
		headers.set('Permissions-Policy', 'camera=(), microphone=(), geolocation=()')
		headers.set('Strict-Transport-Security', 'max-age=63072000; includeSubDomains; preload')
		headers.set('Cross-Origin-Opener-Policy', 'same-origin-allow-popups')
		return (
			retiredOpenGraphImage(event.request) ??
			legacySignInRedirect(event.request) ??
			legacyChallengeRedirect(event.request) ??
			// Resolve legacy aliases and locale spelling in one permanent redirect.
			legacyPageRedirect(event.request) ??
			canonicalPageRedirect(event.request) ??
			dailyEntryRedirect(event.request) ??
			preferredPageRedirect(event.request)
		)
	},
	onBeforeResponse(event, { body }) {
		const { pathname } = new URL(event.request.url)
		if (event.request.method !== 'GET' || /^(?:\/[^/]+)?\/og\/?$/.test(pathname)) return
		if (pathname !== '/api/identity/session' && isProxySkippedPath(pathname)) return
		const headers = body instanceof Response ? body.headers : event.response.headers
		const status = body instanceof Response ? body.status : (event.response.status ?? 200)
		if (status >= 400) return
		const cookies = migratedSessionHeaders(event.request, headers, env.NODE_ENV === 'production')
		if (cookies.length === 0) return
		if (body instanceof Response) {
			const response = new Response(body.body, body)
			response.headers.set('cache-control', 'private, no-store')
			for (const cookie of cookies) response.headers.append('set-cookie', cookie)
			return response
		}
		headers.set('cache-control', 'private, no-store')
		for (const cookie of cookies) headers.append('set-cookie', cookie)
	},
})
