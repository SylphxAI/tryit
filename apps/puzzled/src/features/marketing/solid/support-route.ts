import { query, type RouteDefinition } from '@solidjs/router'
import { getRequestEvent } from 'solid-js/web'
import { defaultLocale, isValidLocale } from '@/lib/i18n/config'
import { createTranslator } from '@/lib/i18n/translate'
import { ogImagePath, pageMetadata } from '@/lib/seo/page-metadata'
import { siteShellData } from '@/shared/solid/site-shell-data'

export const readSupport = query(async (localeParam: string) => {
	'use server'
	const event = getRequestEvent()
	if (!event) throw new Error('Support page needs a request')
	const { request } = event
	event.response.headers.set('Cache-Control', 'private, no-store')
	const { canonicalSiteOrigin } = await import('@/lib/site-origin-request')
	const { readSignedIn } = await import('@/lib/identity/signed-in')
	const locale = isValidLocale(localeParam) ? localeParam : defaultLocale
	const t = createTranslator(locale)
	const title = t('support.title')
	return {
		locale,
		signedIn: await readSignedIn(request),
		shell: siteShellData(locale, '/support', t, new Date()),
		meta: pageMetadata({
			locale,
			path: '/support',
			title,
			description: t('support.description'),
			imagePath: ogImagePath({
				title,
				subtitle: t('support.hero.lead'),
				eyebrow: t('support.hero.eyebrow'),
			}),
			baseUrl: canonicalSiteOrigin(request.headers),
		}),
	}
}, 'support-page')

export const supportRoute: RouteDefinition = {
	matchFilters: { locale: isValidLocale },
	preload: ({ params }) => readSupport(params.locale ?? defaultLocale),
}
