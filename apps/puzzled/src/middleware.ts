import { createMiddleware } from '@solidjs/start/middleware'
import { googleTagIds } from '@/features/analytics/lib/google-tag'
import { adsConfig } from '@/lib/ads'
import { buildCsp, createNonce } from '@/lib/csp'
import { env } from '@/lib/env'
import { canonicalPageRedirect } from '@/lib/i18n/page-redirect'

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
		return canonicalPageRedirect(event.request)
	},
})
