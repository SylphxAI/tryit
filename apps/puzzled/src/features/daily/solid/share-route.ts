import { query, type RouteDefinition, redirect } from '@solidjs/router'
import { getRequestEvent } from 'solid-js/web'
import { defaultLocale, isValidLocale } from '@/lib/i18n/config'

export const readSharePage = query(
	async (localeParam: string, shareId: string | null, search: string) => {
		'use server'
		const request = getRequestEvent()?.request
		if (!request) throw new Error('Share landing requires a request')
		const { readShareLanding } = await import('./share-data')
		const result = await readShareLanding(
			isValidLocale(localeParam) ? localeParam : defaultLocale,
			shareId,
			search,
			request,
		)
		if (result.kind === 'redirect') throw redirect(result.location, 307)
		return result.page
	},
	'share-landing',
)

export const shareRoute: RouteDefinition = {
	matchFilters: { locale: isValidLocale },
	preload: ({ params, location }) =>
		readSharePage(params.locale ?? defaultLocale, params.shareId ?? null, location.search),
}
