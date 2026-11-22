/** @jsxImportSource solid-js */
import {
	createAsync,
	query,
	type RouteDefinition,
	useParams,
	useSearchParams,
} from '@solidjs/router'
import { HttpHeader } from '@solidjs/start'
import { Show } from 'solid-js'
import { getRequestEvent } from 'solid-js/web'
import { Board } from '@/features/console/solid/leaderboard'
import { defaultLocale, isValidLocale } from '@/lib/i18n/config'
import { PageMeta } from '@/shared/solid/page-meta'
import { SiteShell } from '@/shared/solid/site-shell'

const param = (value: string | string[] | undefined) => (Array.isArray(value) ? value[0] : value)

const readPage = query(async (localeParam: string, period?: string, module?: string) => {
	'use server'
	const request = getRequestEvent()?.request
	if (!request) throw new Error('Leaderboard needs a request')
	const { readLeaderboard } = await import('@/features/console/solid/leaderboard-data')
	return readLeaderboard(
		isValidLocale(localeParam) ? localeParam : defaultLocale,
		period,
		module,
		request,
	)
}, 'console-leaderboard')

export const route: RouteDefinition = {
	matchFilters: { locale: isValidLocale },
	preload: ({ params, location }) =>
		readPage(
			params.locale ?? defaultLocale,
			param(location.query.period),
			param(location.query.module),
		),
}

export default function LeaderboardPage() {
	const params = useParams()
	const [search] = useSearchParams()
	const page = createAsync(
		() => readPage(params.locale ?? defaultLocale, param(search.period), param(search.module)),
		{ deferStream: true },
	)
	return (
		<>
			<HttpHeader name="Cache-Control" value="private, no-store" />
			<Show when={page()}>
				{(data) => (
					<>
						<PageMeta value={data().meta} />
						<SiteShell data={data().shell} signedIn={data().viewerSignedIn}>
							<Board data={data()} />
						</SiteShell>
					</>
				)}
			</Show>
		</>
	)
}
