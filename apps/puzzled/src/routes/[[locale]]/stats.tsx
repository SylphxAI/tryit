/** @jsxImportSource solid-js */
import { createAsync, query, type RouteDefinition, useParams } from '@solidjs/router'
import { HttpHeader } from '@solidjs/start'
import { Show } from 'solid-js'
import { getRequestEvent } from 'solid-js/web'
import { StatsConsole } from '@/features/console/solid/stats-console'
import { defaultLocale, isValidLocale } from '@/lib/i18n/config'
import { PageMeta } from '@/shared/solid/page-meta'
import { SiteShell } from '@/shared/solid/site-shell'

const readPage = query(async (localeParam: string) => {
	'use server'
	const request = getRequestEvent()?.request
	if (!request) throw new Error('Player stats need a request')
	const { readStats } = await import('@/features/console/solid/stats-data')
	const locale = isValidLocale(localeParam) ? localeParam : defaultLocale
	return readStats(locale, request)
}, 'console-stats')

export const route: RouteDefinition = {
	matchFilters: { locale: isValidLocale },
	preload: ({ params }) => readPage(params.locale ?? defaultLocale),
}

export default function StatsPage() {
	const params = useParams()
	const page = createAsync(() => readPage(params.locale ?? defaultLocale), { deferStream: true })
	return (
		<>
			<HttpHeader name="Cache-Control" value="private, no-store" />
			<Show when={page()} keyed>
				{(data) => (
					<>
						<PageMeta value={data.meta} />
						<SiteShell data={data.shell} signedIn={data.signedIn}>
							<StatsConsole data={data} />
						</SiteShell>
					</>
				)}
			</Show>
		</>
	)
}
