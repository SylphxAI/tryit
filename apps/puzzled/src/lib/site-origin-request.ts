import 'server-only'

import { env } from './env'
import { resolveSiteOrigin } from './site-origin'

function originInput(requestHeaders: Headers) {
	return {
		host: requestHeaders.get('host'),
		forwardedHost: requestHeaders.get('x-forwarded-host'),
		forwardedProto: requestHeaders.get('x-forwarded-proto'),
		configuredUrl: env.SYLPHX_PUBLIC_URL,
		nodeEnv: env.NODE_ENV,
		port: env.PORT,
	}
}

/** Auth URLs and browser admission retain the validated incoming origin. */
export function requestSiteOrigin(headers: Headers): string {
	const origin = resolveSiteOrigin(originInput(headers), 'request')
	if (!origin) throw new Error('invalid_request_origin')
	return origin
}

/** Canonical, Open Graph and structured-data links advertise Tryit in production. */
export function canonicalSiteOrigin(headers: Headers): string {
	return resolveSiteOrigin(originInput(headers))
}
