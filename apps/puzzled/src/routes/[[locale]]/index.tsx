/** @jsxImportSource solid-js */
import { createAsync, query, type RouteDefinition, useParams } from '@solidjs/router'
import { Show } from 'solid-js'
import { getRequestEvent } from 'solid-js/web'
import { HomePage } from '@/features/marketing/solid/home-page'
import { defaultLocale, isValidLocale } from '@/lib/i18n/config'
import { canonicalSiteOrigin } from '@/lib/site-origin-request'

const getHome = query(async (value: string) => {
	'use server'
	const event = getRequestEvent()
	if (!event) throw new Error('Home requires a request')
	const { request } = event
	event.response.headers.set('Cache-Control', 'private, no-store')
	const { homeDocument, readHomeFacts } = await import('@/features/marketing/solid/home-data')
	const { lineupMotifSvg } = await import('@/features/marketing/solid/home-lineup-art')
	const page = homeDocument(
		isValidLocale(value) ? value : defaultLocale,
		canonicalSiteOrigin(request.headers),
		new Date(),
		lineupMotifSvg,
	)
	return { page, facts: await readHomeFacts(request, page.dayKey) }
}, 'home-document')

export const route = {
	matchFilters: { locale: isValidLocale },
	preload: ({ params }) => getHome(params.locale ?? defaultLocale),
} satisfies RouteDefinition

export default function Page() {
	const params = useParams()
	// Resolve the bounded reads before rendering metadata and the daily hero.
	// Both must appear exactly once even without script-driven stream insertion.
	const home = createAsync(() => getHome(params.locale ?? defaultLocale), { deferStream: true })
	return (
		<Show when={home()} keyed>
			{({ page, facts }) => <HomePage page={page} facts={() => facts} />}
		</Show>
	)
}
