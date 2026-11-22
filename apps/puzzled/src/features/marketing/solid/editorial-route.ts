import { query, type RouteDefinition } from '@solidjs/router'
import { getRequestEvent } from 'solid-js/web'
import { defaultLocale, isValidLocale } from '@/lib/i18n/config'

import { editorialPageData } from './editorial-page-data'

export const editorialPage = query(async (localeParam: string, path: string) => {
	'use server'
	const request = getRequestEvent()?.request
	if (!request) throw new Error('Editorial metadata requires a request')
	const locale = isValidLocale(localeParam) ? localeParam : defaultLocale
	return editorialPageData(request, locale, path)
}, 'editorial-page')

export const editorialRoute = {
	matchFilters: { locale: isValidLocale },
} satisfies RouteDefinition
