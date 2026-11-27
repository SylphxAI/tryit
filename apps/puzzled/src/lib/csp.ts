/**
 * Content Security Policy: a strict policy built per request in
 * `proxy.ts` (docs/reference/csp.md).
 *
 * - Private scripts require this request's nonce; shared home scripts get exact
 *   hashes/SRI after completion. `'strict-dynamic'` lets an authorized
 *   script load the chunks it needs, and makes browsers ignore host
 *   allowlists, so none are listed. No `'unsafe-inline'`, no `'unsafe-eval'`.
 * - SolidStart and app-owned scripts use the per-request nonce; style
 *   attributes used by the boards are allowed independently of scripts.
 */

import { AD_CSP_HOSTS } from './ads'

/** 16 random bytes, base64: a fresh nonce for one response. */
export function createNonce(): string {
	const bytes = new Uint8Array(16)
	crypto.getRandomValues(bytes)
	return btoa(String.fromCharCode(...bytes))
}

export const NONCE_HEADER = 'x-nonce'

/** Hosts the Google tag reports to, added to connect-src only while it is configured. */
export const GOOGLE_TAG_CONNECT_HOSTS = [
	'https://www.googletagmanager.com',
	'https://google-analytics.com',
	'https://*.google-analytics.com',
	'https://analytics.google.com',
	'https://*.analytics.google.com',
	'https://*.g.doubleclick.net',
	'https://ad.doubleclick.net',
	'https://www.google.com',
	'https://www.googleadservices.com',
	'https://pagead2.googlesyndication.com',
] as const

/** Meta Pixel loader and event hosts, added to connect-src only while META_PIXEL_ID is set. */
export const META_PIXEL_CONNECT_HOSTS = [
	'https://connect.facebook.net',
	'https://www.facebook.com',
] as const

/** Frames the Ads conversion tag may use, added only while the tag is configured. */
export const GOOGLE_TAG_FRAME_HOSTS = [
	'https://www.googletagmanager.com',
	'https://td.doubleclick.net',
] as const

export function buildCsp(
	nonce: string | undefined,
	{
		dev = false,
		ads = false,
		googleTag = false,
		metaPixel = false,
		signalOrigin,
	}: {
		dev?: boolean
		ads?: boolean
		googleTag?: boolean
		metaPixel?: boolean
		signalOrigin?: string
	} = {},
): string {
	const tagFrames = googleTag ? ` ${GOOGLE_TAG_FRAME_HOSTS.join(' ')}` : ''
	const tagConnect = googleTag ? ` ${GOOGLE_TAG_CONNECT_HOSTS.join(' ')}` : ''
	const pixelConnect = metaPixel ? ` ${META_PIXEL_CONNECT_HOSTS.join(' ')}` : ''
	const adFrames = ads ? ` ${AD_CSP_HOSTS.frame.join(' ')}` : ''
	const adConnect = ads ? ` ${AD_CSP_HOSTS.connect.join(' ')}` : ''
	return [
		"default-src 'self'",
		// Dev only: Keep development allowances separate from production.
		`script-src 'self'${nonce ? ` 'nonce-${nonce}'` : ''} 'strict-dynamic'${dev ? " 'unsafe-eval'" : ''}`,
		`style-src 'self' 'unsafe-inline'`,
		"img-src 'self' data: blob: https:",
		`font-src 'self' data:`,
		// Identity and error reporting are same-origin; Signal is explicitly scoped.
		`connect-src 'self'${adConnect}${tagConnect}${pixelConnect}${signalOrigin ? ` ${signalOrigin}` : ''}`,
		`frame-src 'self'${adFrames}${tagFrames}`,
		"worker-src 'self'",
		"object-src 'none'",
		"base-uri 'none'",
		"form-action 'self'",
		"frame-ancestors 'none'",
		'upgrade-insecure-requests',
	].join('; ')
}
