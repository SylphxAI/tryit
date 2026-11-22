import { query, type RouteDefinition } from '@solidjs/router'
import { getRequestEvent } from 'solid-js/web'
import { isValidLocale } from '@/lib/i18n/config'
import { canonicalSiteOrigin } from '@/lib/site-origin-request'

export const editorialOrigin = query(async () => {
	'use server'
	const request = getRequestEvent()?.request
	if (!request) throw new Error('Editorial metadata requires a request')
	return canonicalSiteOrigin(request.headers)
}, 'editorial-origin')

export const editorialRoute = {
	matchFilters: { locale: isValidLocale },
	preload: () => editorialOrigin(),
} satisfies RouteDefinition
