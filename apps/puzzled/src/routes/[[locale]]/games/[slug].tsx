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
import { createMemo, createSignal, onCleanup, Show } from 'solid-js'
import { getRequestEvent } from 'solid-js/web'
import { trackGa4GameStart } from '@/features/analytics/lib/ga4-game-start'
import { buildGamePage } from '@/features/catalog/solid/game-data'
import { GameLanding } from '@/features/catalog/solid/game-landing'
import { asDifficulty } from '@/features/daily/lib/difficulty-completion'
import { needsEnglishWordNotice } from '@/features/daily/lib/english-word-puzzles'
import { choosesDailyLevel } from '@/features/daily/lib/pick-disclosure'
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
		const chooseDifficulty =
			!practice &&
			choosesDailyLevel({
				archive: day.mode === 'archive',
				levelCount: data.difficultyLevels.length,
				difficulty,
			})
		const started = start === START_PARAM_ON && !chooseDifficulty
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
			chooseDifficulty,
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
	const [blockedKey, setBlockedKey] = createSignal<string>()
	// The full daily hero owns Five's notice, even when a board resumes below it.
	const englishWordNoticeInHero = () => {
		const page = data()
		return Boolean(
			page?.day.mode === 'daily' &&
				!page.practice &&
				!page.started &&
				page.data.slug === 'word-guess' &&
				needsEnglishWordNotice(page.data.locale, page.data.slug),
		)
	}
	const visitKey = createMemo(() => {
		const page = data()
		return (
			page &&
			JSON.stringify([
				page.data.locale,
				page.data.slug,
				page.day.puzzleDate,
				page.todayKey,
				page.difficulty,
				page.practice,
			])
		)
	})
	const locked = () => data()?.initialDaily?.kind === 'locked' || blockedKey() === playKey()
	const showDifficulty = () => {
		const page = data()
		const kind = page?.initialDaily?.kind
		return !!page?.chooseDifficulty && !locked() && kind !== 'completed' && kind !== 'closed'
	}
	const playKey = createMemo(() => {
		const visit = visitKey()
		return visit && JSON.stringify([visit, data()?.started])
	})
	// Passive → explicit play remounts DailyPlay, not the board visit. Count the
	// first playable observation even if consent is off; never replay on grant.
	const onPlayable = createMemo(() => {
		visitKey()
		let seen = false
		let stop: (() => void) | undefined
		onCleanup(() => stop?.())
		return (slug: string, mode: 'daily' | 'archive') => {
			if (seen) return
			seen = true
			stop = trackGa4GameStart(slug, mode)
		}
	})
	return (
		<Show when={data() !== undefined}>
			<Show when={data()} fallback={<NotFound />}>
				{(page) => (
					<GameLanding
						data={page().data}
						englishWordNoticeInHero={englishWordNoticeInHero()}
						locked={locked()}
						chooseDifficulty={page().chooseDifficulty}
						showDifficulty={showDifficulty()}
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
										englishWordNoticeInHero={englishWordNoticeInHero()}
										day={page().day}
										todayKey={page().todayKey}
										resetAt={page().resetAt}
										onLandingBlocked={() => setBlockedKey(_playKey)}
										chooseDifficulty={page().chooseDifficulty}
										onPlayable={onPlayable()}
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
