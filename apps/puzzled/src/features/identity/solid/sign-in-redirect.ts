import { defaultLocale } from '@/lib/i18n/config'
import { localeFromPathname } from '@/lib/i18n/page-locale'
import { safeCallbackPath } from '@/lib/identity/after-sign-up'
import { localizedPath } from '@/lib/seo/urls'

/** Preserve only the validated return path and known transition state. */
export function legacySignInRedirect(request: Request): Response | undefined {
	if (request.method !== 'GET' && request.method !== 'HEAD') return
	const url = new URL(request.url)
	const locale = localeFromPathname(url.pathname)
	const pathname = locale ? url.pathname.slice(locale.length + 1) : url.pathname
	if (!/^\/(login|signup|sign-up|register|forgot-password)\/?$/.test(pathname)) return
	const search = new URLSearchParams()
	const next =
		safeCallbackPath(url.searchParams.get('callbackUrl')) ??
		safeCallbackPath(url.searchParams.get('next'))
	if (next) search.set('callbackUrl', next)
	if (url.searchParams.get('error') === 'oauth_failed') search.set('error', 'oauth_failed')
	if (/^\/forgot-password\/?$/.test(pathname)) search.set('recovery', '1')
	const href = localizedPath(locale ?? defaultLocale, '/sign-in')
	return new Response(null, {
		status: 308,
		headers: { location: search.size ? `${href}?${search}` : href, 'cache-control': 'no-store' },
	})
}
