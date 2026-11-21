import { defaultLocale } from './config'
import { localeFromPathname } from './page-locale'

export function canonicalPageRedirect(request: Request): Response | undefined {
	if (request.method !== 'GET' && request.method !== 'HEAD') return
	const { pathname, search } = new URL(request.url)
	const locale = localeFromPathname(pathname)
	if (!locale) return
	const segment = pathname.slice(1, locale.length + 1)
	const suffix = pathname.slice(segment.length + 1)
	const location = locale === defaultLocale ? suffix || '/' : `/${locale}${suffix}`
	if (location === pathname) return
	// Emit only root-relative paths. In particular, stripping a locale must
	// never turn a doubled slash into a protocol-relative redirect.
	const path = location.replace(/^\/+/, '/')
	return new Response(null, {
		status: segment === defaultLocale ? 308 : 307,
		headers: { Location: `${path}${search}` },
	})
}
