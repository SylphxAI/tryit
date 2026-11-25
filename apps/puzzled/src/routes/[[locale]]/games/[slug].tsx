/** @jsxImportSource solid-js */
import {
	createAsync,
	type Params,
	query,
	type RouteDefinition,
	type SearchParams,
	useParams,
	useSearchParams,
} from '@solidjs/router'
import { createMemo, createSignal, Show } from 'solid-js'
import { getRequestEvent } from 'solid-js/web'
import { buildGamePage } from '@/features/catalog/solid/game-data'
import { GameLanding } from '@/features/catalog/solid/game-landing'
import { asDifficulty } from '@/features/daily/lib/difficulty-completion'
import { START_PARAM_ON } from '@/features/daily/lib/start-param'
import { todayPlayPath } from '@/features/daily/lib/today-play-path'
import { DailyPlay } from '@/features/daily/solid/daily-play'
import { isPracticeSupported } from '@/features/practice/lib/practice'
import { PracticePlay } from '@/features/practice/solid/practice-play'
import { defaultLocale, isValidLocale, locales } from '@/lib/i18n/config'
import { nextProductDayStart, productDayKey } from '@/lib/product-day'
import { localizedPath } from '@/lib/seo/urls'
import { canonicalSiteOrigin } from '@/lib/site-origin-request'
import NotFound from '@/shared/solid/not-found'

const getGamePage = query(
	async (
		locale: string,
		slug: string,
		date?: string,
		level?: string,
		start?: string,
		mode?: string,
	) => {
		'use server'
		const event = getRequestEvent()
		if (!event) throw new Error('Game page requires a request')
		const { request } = event
		event.response.headers.set('Cache-Control', 'private, no-store')
		const now = new Date()
		const data = buildGamePage(
			isValidLocale(locale) ? locale : defaultLocale,
			slug,
			canonicalSiteOrigin(request.headers),
			now,
		)
		if (!data) return null
		const { resolveGameDayRequest } = await import('@/features/daily/lib/day-request')
		const { readSignedIn } = await import('@/lib/identity/signed-in')
		const practice = mode === 'practice' && isPracticeSupported(data.slug)
		const day = resolveGameDayRequest({ date }, now)
		const difficulty = data.difficultyLevels.length ? asDifficulty(level) : undefined
		const started = start === START_PARAM_ON
		// The passive landing can paint an authoritative board or chooser in one response.
		// Explicit play and archive keep their existing just-in-time browser read.
		const [signedIn, initialDaily] = await Promise.all([
			readSignedIn(request),
			!practice && day.mode === 'daily' && !started
				? (await import('@/features/daily/solid/daily-read')).readDailyLanding(request.headers, {
						gameSlug: data.slug,
						difficulty,
					})
				: undefined,
		])
		return {
			data,
			practice,
			day,
			todayKey: productDayKey(now),
			difficulty,
			started,
			resetAt: nextProductDayStart(now).getTime(),
			initialDaily,
			signedIn,
		}
	},
	'game-page',
)

const scalar = (value: string | string[] | undefined) =>
	typeof value === 'string' ? value : undefined

const readGamePage = (params: Params, search: SearchParams) =>
	getGamePage(
		params.locale ?? defaultLocale,
		params.slug ?? '',
		scalar(search.date),
		scalar(search.difficulty),
		scalar(search.start),
		scalar(search.mode),
	)

export const route = {
	matchFilters: { locale: (segment: string) => locales.some((locale) => locale === segment) },
	preload: ({ params, location }) => readGamePage(params, location.query),
} satisfies RouteDefinition

export default function GamePage() {
	const params = useParams()
	const [search] = useSearchParams()
	const data = createAsync(() => readGamePage(params, search), { deferStream: true })
	const [lockedKey, setLockedKey] = createSignal<string>()
	const playKey = createMemo(() => {
		const page = data()
		return (
			page &&
			JSON.stringify([
				page.data.locale,
				page.data.slug,
				page.day.puzzleDate,
				page.todayKey,
				page.difficulty,
				page.started,
				page.practice,
			])
		)
	})
	return (
		<Show when={data() !== undefined}>
			<Show when={data()} fallback={<NotFound />}>
				{(page) => (
					<GameLanding
						data={page().data}
						locked={page().initialDaily?.kind === 'locked' || lockedKey() === playKey()}
						stage={page().practice || (page().day.mode === 'daily' && page().started)}
						practice={page().practice}
						daily={!page().practice && page().day.mode === 'daily'}
						difficulty={page().difficulty}
						signedIn={page().signedIn}
						playHref={
							page().day.mode === 'daily'
								? localizedPath(
										page().data.locale,
										todayPlayPath(page().data.slug, page().difficulty),
									)
								: '#play'
						}
					>
						<Show when={playKey()} keyed>
							{(_playKey) =>
								page().practice ? (
									<PracticePlay data={page().data} difficulty={page().difficulty} />
								) : (
									<DailyPlay
										data={page().data}
										day={page().day}
										todayKey={page().todayKey}
										resetAt={page().resetAt}
										onLocked={() => setLockedKey(_playKey)}
										difficulty={page().difficulty}
										initial={page().initialDaily}
										started={page().started}
									/>
								)
							}
						</Show>
					</GameLanding>
				)}
			</Show>
		</Show>
	)
}
