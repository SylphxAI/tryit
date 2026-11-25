/** @jsxImportSource solid-js */
import {
	createAsync,
	query,
	type RouteDefinition,
	useParams,
	useSearchParams,
} from '@solidjs/router'
import { Show } from 'solid-js'
import { getRequestEvent } from 'solid-js/web'
import { buildCatalogPage } from '@/features/catalog/solid/catalog-data'
import { CatalogPage } from '@/features/catalog/solid/catalog-page'
import { defaultLocale, isValidLocale, locales } from '@/lib/i18n/config'
import { canonicalSiteOrigin } from '@/lib/site-origin-request'

const getCatalogPage = query(async (locale: string) => {
	'use server'
	const event = getRequestEvent()
	if (!event) throw new Error('Catalog requires a request')
	const { request } = event
	event.response.headers.set('Cache-Control', 'private, no-store')
	const { readSignedIn } = await import('@/lib/identity/signed-in')
	return {
		data: buildCatalogPage(
			isValidLocale(locale) ? locale : defaultLocale,
			canonicalSiteOrigin(request.headers),
			new Date(),
		),
		signedIn: await readSignedIn(request),
	}
}, 'catalog-page')

export const route = {
	matchFilters: { locale: (segment: string) => locales.some((locale) => locale === segment) },
	preload: ({ params }) => getCatalogPage(params.locale ?? defaultLocale),
} satisfies RouteDefinition

export default function GamesCatalog() {
	const params = useParams()
	const [search] = useSearchParams()
	const data = createAsync(() => getCatalogPage(params.locale ?? defaultLocale), {
		deferStream: true,
	})
	return (
		<Show when={data()}>
			{(value) => (
				<CatalogPage
					data={value().data}
					signedIn={value().signedIn}
					query={search.q}
					category={search.category}
				/>
			)}
		</Show>
	)
}
