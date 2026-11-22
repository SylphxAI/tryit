/** @jsxImportSource solid-js */
import {
	createAsync,
	query,
	type RouteDefinition,
	useParams,
	useSearchParams,
} from '@solidjs/router'
import { HttpHeader } from '@solidjs/start'
import { createMemo, Show } from 'solid-js'
import { getRequestEvent } from 'solid-js/web'
import { buildGamePage } from '@/features/catalog/solid/game-data'
import { GameLanding } from '@/features/catalog/solid/game-landing'
import { asDifficulty } from '@/features/daily/lib/difficulty-completion'
import { START_PARAM_ON } from '@/features/daily/lib/start-param'
import { todayPlayPath } from '@/features/daily/lib/today-play-path'
import { DailyPlay } from '@/features/daily/solid/daily-play'
import { defaultLocale, isValidLocale, locales } from '@/lib/i18n/config'
import { localizedPath } from '@/lib/seo/urls'
import { canonicalSiteOrigin } from '@/lib/site-origin-request'
import NotFound from '@/shared/solid/not-found'

const getGamePage = query(async (locale: string, slug: string, date?: string) => {
	'use server'
	const request = getRequestEvent()?.request
	if (!request) throw new Error('Game page requires a request')
	const now = new Date()
	const data = buildGamePage(
		isValidLocale(locale) ? locale : defaultLocale,
		slug,
		canonicalSiteOrigin(request.headers),
		now,
	)
	if (!data) return null
	const { resolveGameDayRequest } = await import('@/features/daily/lib/day-request')
	const { hasAccountSessionCookie } = await import('@/lib/api/request-connect')
	return {
		data,
		day: resolveGameDayRequest({ date }, now),
		isGuest: !hasAccountSessionCookie(request.headers),
	}
}, 'game-page')

const scalar = (value: string | string[] | undefined) =>
	typeof value === 'string' ? value : undefined

export const route = {
	matchFilters: { locale: (segment: string) => locales.some((locale) => locale === segment) },
	preload: ({ params, location }) =>
		getGamePage(
			params.locale ?? defaultLocale,
			params.slug ?? '',
			new URLSearchParams(location.search).get('date') ?? undefined,
		),
} satisfies RouteDefinition

export default function GamePage() {
	const params = useParams()
	const [search] = useSearchParams()
	const data = createAsync(
		() => getGamePage(params.locale ?? defaultLocale, params.slug ?? '', scalar(search.date)),
		{ deferStream: true },
	)
	const difficulty = () =>
		data()?.data.difficultyLevels.length ? asDifficulty(scalar(search.difficulty)) : undefined
	const playKey = createMemo(() => {
		const page = data()
		return page && JSON.stringify([page.data.slug, page.day.puzzleDate, difficulty()])
	})
	return (
		<>
			<HttpHeader name="Cache-Control" value="private, no-store" />
			<Show when={data() !== undefined}>
				<Show when={data()} fallback={<NotFound />}>
					{(page) => (
						<GameLanding
							data={page().data}
							stage={page().day.mode === 'daily' && search.start === START_PARAM_ON}
							daily={page().day.mode === 'daily'}
							isGuest={page().isGuest}
							playHref={
								page().day.mode === 'daily'
									? localizedPath(page().data.locale, todayPlayPath(page().data.slug, difficulty()))
									: '#play'
							}
						>
							<Show when={playKey()} keyed>
								{(_playKey) => (
									<DailyPlay
										data={page().data}
										day={page().day}
										difficulty={difficulty()}
										started={search.start === START_PARAM_ON}
									/>
								)}
							</Show>
						</GameLanding>
					)}
				</Show>
			</Show>
		</>
	)
}
