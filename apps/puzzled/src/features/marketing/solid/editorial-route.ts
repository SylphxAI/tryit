import { query, type RouteDefinition } from '@solidjs/router'
import { getRequestEvent } from 'solid-js/web'
import { defaultLocale, isValidLocale } from '@/lib/i18n/config'
import { createTranslator } from '@/lib/i18n/translate'
import { canonicalSiteOrigin } from '@/lib/site-origin-request'
import { siteShellData } from '@/shared/solid/site-shell-data'

export const editorialPage = query(async (localeParam: string, path: string) => {
	'use server'
	const request = getRequestEvent()?.request
	if (!request) throw new Error('Editorial metadata requires a request')
	const locale = isValidLocale(localeParam) ? localeParam : defaultLocale
	return {
		origin: canonicalSiteOrigin(request.headers),
		shell: siteShellData(locale, path, createTranslator(locale), new Date()),
	}
}, 'editorial-page')

export const editorialRoute = {
	matchFilters: { locale: isValidLocale },
} satisfies RouteDefinition
