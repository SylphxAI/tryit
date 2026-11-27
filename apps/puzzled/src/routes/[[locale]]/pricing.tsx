/** @jsxImportSource solid-js */
import { createAsync, query, type RouteDefinition, useLocation, useParams } from '@solidjs/router'
import { HttpHeader } from '@solidjs/start'
import { Show } from 'solid-js'
import { getRequestEvent } from 'solid-js/web'
import { PricingOfferVisit } from '@/features/analytics/solid/pricing-offer-visit'
import { PricingPage } from '@/features/plus/solid/pricing-page'
import { defaultLocale, isValidLocale, locales } from '@/lib/i18n/config'

const getPricing = query(async (locale: string, search: string) => {
	'use server'
	const request = getRequestEvent()?.request
	if (!request) throw new Error('Pricing requires a request')
	const { readPricingPage } = await import('@/features/plus/solid/pricing-data')
	return readPricingPage(
		isValidLocale(locale) ? locale : defaultLocale,
		request,
		new URLSearchParams(search),
	)
}, 'pricing-page')

export const route = {
	matchFilters: { locale: (segment: string) => locales.some((locale) => locale === segment) },
	preload: ({ params, location }) => getPricing(params.locale ?? defaultLocale, location.search),
} satisfies RouteDefinition

export default function Pricing() {
	const params = useParams()
	const location = useLocation()
	const viewed = new Set<'plus' | 'family'>()
	const data = createAsync(() => getPricing(params.locale ?? defaultLocale, location.search), {
		deferStream: true,
	})
	return (
		<>
			<HttpHeader name="Cache-Control" value="private, no-store" />
			<PricingOfferVisit.Provider value={viewed}>
				<Show when={data()} keyed>
					{(page) => <PricingPage data={page} />}
				</Show>
			</PricingOfferVisit.Provider>
		</>
	)
}
