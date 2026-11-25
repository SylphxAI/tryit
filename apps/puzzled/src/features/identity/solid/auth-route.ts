import { query, type RouteDefinition, redirect } from '@solidjs/router'
import { getRequestEvent } from 'solid-js/web'
import { defaultLocale, isValidLocale, locales } from '@/lib/i18n/config'
import { safeCallbackPath } from '@/lib/identity/after-sign-up'
import { localizedPath } from '@/lib/seo/urls'
import type { authPages } from './auth-data'

export type AuthPageKind = keyof typeof authPages

export const getAuthPage = query(
	async (localeParam: string, kind: AuthPageKind, callback: string | null) => {
		'use server'
		const request = getRequestEvent()?.request
		if (!request) throw new Error('Auth page requires a request')
		const locale = isValidLocale(localeParam) ? localeParam : defaultLocale
		const { requestUser } = await import('@/lib/identity/request-identity')
		const user = await requestUser(request)
		if (kind === 'sign-in' && user)
			throw redirect(safeCallbackPath(callback) ?? localizedPath(locale))
		const { readAuthPage } = await import('./auth-data')
		return { locale, signedIn: !!user, ...(await readAuthPage(locale, kind, request)) }
	},
	'auth-page',
)

export function authRoute(kind: AuthPageKind): RouteDefinition {
	return {
		matchFilters: { locale: (segment: string) => locales.some((locale) => locale === segment) },
		preload: ({ params, location }) =>
			getAuthPage(
				params.locale ?? defaultLocale,
				kind,
				returnPath(new URLSearchParams(location.search)),
			),
	}
}

function returnPath(search: URLSearchParams) {
	return safeCallbackPath(search.get('callbackUrl')) ?? safeCallbackPath(search.get('next'))
}
