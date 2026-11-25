import { query, type RouteDefinition } from '@solidjs/router'
import { getRequestEvent } from 'solid-js/web'
import { LEGAL_EMAIL, PRIVACY_EMAIL } from '@/lib/config/app'
import { defaultLocale, isValidLocale, locales } from '@/lib/i18n/config'
import { createTranslator } from '@/lib/i18n/translate'
import { ogImagePath, pageMetadata } from '@/lib/seo/page-metadata'
import { siteShellData } from '@/shared/solid/site-shell-data'

export type Policy = 'terms' | 'privacy'
const order: Record<Policy, readonly string[]> = {
	terms: [
		'keyTerms',
		'acceptance',
		'seller',
		'service',
		'accounts',
		'subscriptions',
		'conduct',
		'suspension',
		'ip',
		'disclaimer',
		'liability',
		'changes',
		'general',
		'contact',
	],
	privacy: [
		'intro',
		'controller',
		'dataCollection',
		'dataUse',
		'payments',
		'thirdParty',
		'transfers',
		'retention',
		'cookies',
		'rights',
		'children',
		'security',
		'changes',
		'contact',
	],
}
const afterKeys: Record<string, string> = {
	dataUse: 'items.noSale',
	thirdParty: 'others',
	rights: 'response',
}
const providers = [
	['Stripe', 'stripe'],
	['Google', 'google'],
	['Google Analytics, Google Ads', 'googleMeasurement'],
	['Sylphx Limited', 'mail'],
] as const

export const readPolicy = query(async (localeParam: string, kind: Policy) => {
	'use server'
	const request = getRequestEvent()?.request
	if (!request) throw new Error('Policy document needs a request')
	const { canonicalSiteOrigin } = await import('@/lib/site-origin-request')
	const locale = isValidLocale(localeParam) ? localeParam : defaultLocale
	const translate = createTranslator(locale)
	const t = (key: string) => translate(`legal.${kind}.${key}`)
	const sections = order[kind].map((id) => {
		const path = `sections.${id}`
		const items = translate.raw(`legal.${kind}.${path}.items`)
		const bullets =
			items && typeof items === 'object'
				? Object.keys(items)
						.filter((key) => key !== 'noSale')
						.map((key) => t(`${path}.items.${key}`))
				: []
		const paragraphs = [t(`${path}.content`)]
		if (id === 'cookies') paragraphs.push(t(`${path}.notices`), t(`${path}.google`))
		const afterKey = afterKeys[id]
		return {
			id,
			title: t(`${path}.title`),
			paragraphs,
			bullets,
			providers:
				id === 'thirdParty'
					? providers.map(([name, key]) => ({ name, description: t(`${path}.${key}`) }))
					: [],
			after: afterKey ? t(`${path}.${afterKey}`) : null,
		}
	})
	const title = t('title')
	const lead = t('lead')
	const eyebrow = t('eyebrow')
	const revision = t('revision')
	const date = new Date(`${revision}T00:00:00Z`)
	const revised = Number.isFinite(date.getTime())
		? new Intl.DateTimeFormat(locale, { dateStyle: 'long', timeZone: 'UTC' }).format(date)
		: null
	const path = `/${kind}`
	return {
		shell: siteShellData(locale, path, translate, new Date()),
		meta: pageMetadata({
			locale,
			path,
			title,
			description: lead,
			baseUrl: canonicalSiteOrigin(request.headers),
			imagePath: ogImagePath({ title, subtitle: lead, eyebrow }),
		}),
		locale,
		title,
		lead,
		eyebrow,
		revision,
		revised,
		updated: t('lastUpdated'),
		toc: t('toc.title'),
		sections,
		alternate: kind === 'terms' ? 'privacy' : 'terms',
		alternateTitle: translate(kind === 'terms' ? 'legal.privacy.title' : 'legal.terms.title'),
		email: kind === 'terms' ? LEGAL_EMAIL : PRIVACY_EMAIL,
	}
}, 'policy-document')

export function policyRoute(kind: Policy): RouteDefinition {
	return {
		matchFilters: { locale: (value: string) => locales.some((l) => l === value) },
		preload: ({ params }) => readPolicy(params.locale ?? defaultLocale, kind),
	}
}
