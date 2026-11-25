/** @jsxImportSource solid-js */
import { createAsync, query, type RouteDefinition, useParams } from '@solidjs/router'
import { Show } from 'solid-js'
import { getRequestEvent } from 'solid-js/web'
import { isComparisonSlug } from '@/features/marketing/components/comparison-slugs'
import { COMPARISON_SPECS } from '@/features/marketing/components/comparison-specs'
import { ComparisonLanding } from '@/features/marketing/solid/comparison-landing'
import { EditorialMeta } from '@/features/marketing/solid/editorial-meta'
import { editorialRoute } from '@/features/marketing/solid/editorial-route'
import { defaultLocale, isValidLocale } from '@/lib/i18n/config'
import NotFound from '@/shared/solid/not-found'
import { SiteShell } from '@/shared/solid/site-shell'

const getComparisonPage = query(async (localeParam: string, rival: string) => {
	'use server'
	const event = getRequestEvent()
	if (!event) throw new Error('Comparison page requires a request')
	const { request } = event
	event.response.headers.set('Cache-Control', 'private, no-store')
	if (!isComparisonSlug(rival)) return null
	const locale = isValidLocale(localeParam) ? localeParam : defaultLocale
	const { readComparisonPricing } = await import(
		'@/features/marketing/solid/comparison-pricing-data'
	)
	const { editorialPageData } = await import('@/features/marketing/solid/editorial-page-data')
	const { readSignedIn } = await import('@/lib/identity/signed-in')
	const [pricing, signedIn] = await Promise.all([
		readComparisonPricing(request.headers, locale),
		readSignedIn(request),
	])
	return {
		...editorialPageData(request, locale, `/vs/${rival}`),
		...pricing,
		signedIn,
	}
}, 'comparison-page')

export const route = {
	...editorialRoute,
	preload: ({ params }) => getComparisonPage(params.locale ?? defaultLocale, params.rival ?? ''),
} satisfies RouteDefinition

export default function Page() {
	const params = useParams()
	const spec = () =>
		params.rival && isComparisonSlug(params.rival) ? COMPARISON_SPECS[params.rival] : undefined
	const page = createAsync(
		() => getComparisonPage(params.locale ?? defaultLocale, params.rival ?? ''),
		{ deferStream: true },
	)
	return (
		<Show when={spec()} keyed fallback={<NotFound />}>
			{(value) => (
				<Show when={page()} keyed>
					{(data) => (
						<>
							<EditorialMeta
								spec={value}
								imageSubtitle={value.facts.join(' · ')}
								origin={data.origin}
								locale={data.locale}
								type="article"
							/>
							<SiteShell data={data.shell} signedIn={data.signedIn}>
								<ComparisonLanding
									spec={value}
									origin={data.origin}
									locale={data.locale}
									pricing={data.pricing}
								/>
							</SiteShell>
						</>
					)}
				</Show>
			)}
		</Show>
	)
}
