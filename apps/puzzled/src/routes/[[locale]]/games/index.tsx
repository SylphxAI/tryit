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
	const request = getRequestEvent()?.request
	if (!request) throw new Error('Catalog requires a request')
	return buildCatalogPage(
		isValidLocale(locale) ? locale : defaultLocale,
		canonicalSiteOrigin(request.headers),
		new Date(),
	)
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
			{(value) => <CatalogPage data={value()} query={search.q} category={search.category} />}
		</Show>
	)
}
