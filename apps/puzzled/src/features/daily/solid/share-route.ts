import { query, type RouteDefinition, redirect } from '@solidjs/router'
import { getRequestEvent } from 'solid-js/web'
import { defaultLocale, isValidLocale } from '@/lib/i18n/config'

export const readSharePage = query(
	async (localeParam: string, shareId: string | null, search: string) => {
		'use server'
		const event = getRequestEvent()
		if (!event) throw new Error('Share landing requires a request')
		const { request } = event
		event.response.headers.set('Cache-Control', 'private, no-store')
		const { readShareLanding } = await import('./share-data')
		const result = await readShareLanding(
			isValidLocale(localeParam) ? localeParam : defaultLocale,
			shareId,
			search,
			request,
		)
		if (result.kind === 'redirect') throw redirect(result.location, 307)
		const { readSignedIn } = await import('@/lib/identity/signed-in')
		return { ...result.page, signedIn: await readSignedIn(request) }
	},
	'share-landing',
)

export const shareRoute: RouteDefinition = {
	matchFilters: { locale: isValidLocale },
	preload: ({ params, location }) =>
		readSharePage(params.locale ?? defaultLocale, params.shareId ?? null, location.search),
}
