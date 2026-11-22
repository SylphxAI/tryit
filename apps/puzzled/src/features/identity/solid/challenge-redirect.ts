import { defaultLocale } from '@/lib/i18n/config'
import { localeFromPathname } from '@/lib/i18n/page-locale'
import { safeCallbackPath } from '@/lib/identity/after-sign-up'
import { localizedPath } from '@/lib/seo/urls'

/** Auth owns step-up challenges now; retain old bookmarks as a same-site redirect. */
export function legacyChallengeRedirect(request: Request): Response | undefined {
	if (request.method !== 'GET' && request.method !== 'HEAD') return
	const { pathname, searchParams } = new URL(request.url)
	const locale = localeFromPathname(pathname)
	const route = locale ? pathname.slice(locale.length + 1) : pathname
	if (route !== '/challenge' && route !== '/challenge/') return
	const home = localizedPath(locale ?? defaultLocale)
	const redirect = safeCallbackPath(searchParams.get('redirect'))
	// Check the resolved pathname to prevent encoded and locale-prefixed loops.
	const resolved = redirect ? new URL(redirect, 'https://app.invalid') : null
	const target = resolved?.pathname.replace(/%[0-9a-f]{2}/gi, (segment) =>
		String.fromCharCode(Number.parseInt(segment.slice(1), 16)),
	)
	return new Response(null, {
		status: 307,
		headers: {
			location: redirect && target && !/(?:^|\/)challenge\/?$/i.test(target) ? redirect : home,
			'cache-control': 'private, no-store',
		},
	})
}
