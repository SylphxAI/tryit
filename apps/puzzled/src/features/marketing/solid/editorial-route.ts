import { query, type RouteDefinition } from '@solidjs/router'
import { getRequestEvent } from 'solid-js/web'
import { defaultLocale, isValidLocale } from '@/lib/i18n/config'

import { editorialPageData } from './editorial-page-data'

export const editorialPage = query(async (localeParam: string, path: string) => {
	'use server'
	const event = getRequestEvent()
	if (!event) throw new Error('Editorial metadata requires a request')
	const { request } = event
	event.response.headers.set('Cache-Control', 'private, no-store')
	const { readSignedIn } = await import('@/lib/identity/signed-in')
	const locale = isValidLocale(localeParam) ? localeParam : defaultLocale
	return { ...editorialPageData(request, locale, path), signedIn: await readSignedIn(request) }
}, 'editorial-page')

export const editorialRoute = {
	matchFilters: { locale: isValidLocale },
} satisfies RouteDefinition
