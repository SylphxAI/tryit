import { explicitChallengeGame, isShareLandingQuery } from '@/features/daily/lib/challenge'
import { getTodaysFreeGame } from '@/lib/free-rotation'
import { defaultLocale, type Locale } from '@/lib/i18n/config'
import { localeFromPathname } from '@/lib/i18n/page-locale'
import { localizedPath } from '@/lib/seo/urls'

export function shareQuery(search: URLSearchParams): Record<string, string> {
	const values: Record<string, string> = Object.create(null)
	for (const [key, value] of search) if (!Object.hasOwn(values, key)) values[key] = value
	return values
}

export function dailyEntryTarget(locale: Locale, search: string, now = new Date()) {
	const query = shareQuery(new URLSearchParams(search))
	if (isShareLandingQuery(query)) return null
	const game = explicitChallengeGame(query) ?? getTodaysFreeGame(now)
	return localizedPath(locale, `/games/${game}${search}`)
}

/** Keep the HTTP 307 contract for partner links; router queries coerce SSR redirects to 302. */
export function dailyEntryRedirect(request: Request): Response | undefined {
	if (request.method !== 'GET' && request.method !== 'HEAD') return
	const { pathname, search } = new URL(request.url)
	const locale = localeFromPathname(pathname)
	const path = locale ? pathname.slice(locale.length + 1) : pathname
	if (path !== '/daily' && path !== '/daily/') return
	const location = dailyEntryTarget(locale ?? defaultLocale, search)
	if (location)
		return new Response(null, {
			status: 307,
			headers: { location, 'cache-control': 'private, no-store' },
		})
}
