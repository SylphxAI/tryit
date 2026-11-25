/** @jsxImportSource solid-js */
import { Navigate, type RouteDefinition, useLocation } from '@solidjs/router'
import { localeFromPathname, pageLocale } from '@/lib/i18n/page-locale'
import { localizedPath } from '@/lib/seo/urls'

export const route: RouteDefinition = {
	matchFilters: { locale: (segment) => localeFromPathname('/' + segment) !== null },
}

// Document requests are handled by legacyPageRedirect before Solid renders.
export default function LeaderboardRedirect() {
	const { pathname, search } = useLocation()
	return <Navigate href={localizedPath(pageLocale(pathname), '/stats') + search} />
}
