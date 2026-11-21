/** @jsxImportSource solid-js */
import { ConnectError } from '@connectrpc/connect'
import { Lock, Play } from 'lucide-solid'
import {
	createEffect,
	createResource,
	createSignal,
	For,
	lazy,
	Match,
	Show,
	Suspense,
	Switch,
} from 'solid-js'
import { Dynamic, isServer } from 'solid-js/web'
import { sendFunnel } from '@/features/analytics/lib/funnel'
import type { GamePageData } from '@/features/catalog/solid/game-data'
import { playButton } from '@/features/catalog/solid/game-landing'
import type { PuzzleDifficulty } from '@/games/types'
import { isPlusRequiredError } from '@/lib/billing/plus'
import { startDaily } from '@/lib/connect/puzzle-client'
import { createTranslator } from '@/lib/i18n/translate'
import { localizedPath } from '@/lib/seo/urls'
import { classifyDailyResponse, type DailySnapshot, loadDailySnapshot } from '../lib/daily-fallback'
import { recordDailyPick } from '../lib/daily-picks'
import type { GameDayRequest } from '../lib/day-request'
import { markStartIntent, takeStartIntent } from '../lib/start-intent'
import { todayPlayPath } from '../lib/today-play-path'

const boards = new Map([
	['sudoku', lazy(() => import('@/games/sudoku/solid-board'))],
	['nonogram', lazy(() => import('@/games/nonogram/solid-board'))],
	['word-search', lazy(() => import('@/games/word-search/solid-board'))],
	['pattern-match', lazy(() => import('@/games/pattern-match/solid-board'))],
	['crowns', lazy(() => import('@/games/queens/solid-board'))],
	['duo', lazy(() => import('@/games/tango/solid-board'))],
	['number-path', lazy(() => import('@/games/number-path/solid-board'))],
	['word-groups', lazy(() => import('@/games/word-groups/solid-board'))],
	['killer-sudoku', lazy(() => import('@/games/killer-sudoku/solid-board'))],
	['word-ladder', lazy(() => import('@/games/word-ladder/solid-board'))],
])
type Locked = { kind: 'locked' }
type State = DailySnapshot | Locked

const failed = (error: unknown): State =>
	isPlusRequiredError(ConnectError.from(error).rawMessage)
		? { kind: 'locked' }
		: { kind: 'unavailable' }

export function DailyPlay(props: {
	data: GamePageData
	day: GameDayRequest
	difficulty?: PuzzleDifficulty
	started: boolean
}) {
	const t = createTranslator(props.data.locale)
	const slug = props.data.slug
	const archive = props.day.mode === 'archive'
	const choose = !archive && props.data.difficultyLevels.length > 0 && !props.difficulty
	const board = boards.get(slug)
	const [starting, setStarting] = createSignal(false)
	const input = { gameSlug: slug, difficulty: props.difficulty, puzzleDate: props.day.puzzleDate }
	const [state, { mutate, refetch }] = createResource(
		() => !isServer,
		async (): Promise<State> => {
			try {
				return await loadDailySnapshot(input)
			} catch (error) {
				return failed(error)
			}
		},
	)
	const play = async (puzzleDate: string) => {
		if (starting() || !board) return
		setStarting(true)
		try {
			mutate(classifyDailyResponse(await startDaily({ ...input, puzzleDate })))
		} catch (error) {
			mutate(failed(error))
		} finally {
			setStarting(false)
		}
	}
	let handled = false
	createEffect(() => {
		const value = state()
		if (!value || handled) return
		handled = true
		if (board && !choose && props.started && value.kind === 'startable' && takeStartIntent(slug))
			void play(value.puzzleDate)
	})
	const snapshot = <K extends State['kind']>(kind: K) => {
		const value = state()
		return value?.kind === kind ? (value as Extract<State, { kind: K }>) : undefined
	}
	let seen = false
	createEffect(() => {
		const value = snapshot('playable')
		if (!value || seen || !board || choose) return
		seen = true
		sendFunnel({ event: 'game_start', game_slug: slug })
		if (!archive) recordDailyPick(value.puzzleDate, slug)
	})
	const returnTo = () =>
		props.data.canonicalPath +
		(archive
			? `?${new URLSearchParams({ mode: 'archive', date: props.day.puzzleDate ?? '' })}`
			: '')
	const unavailable = () => (
		<div class="mx-auto max-w-md space-y-2 text-center">
			<h2 class="font-display text-xl">{t('daily.unavailableTitle')}</h2>
			<p>{t('daily.unavailableDescription')}</p>
			<button type="button" class={playButton} onClick={() => void refetch()}>
				{t('common.retry')}
			</button>
		</div>
	)

	return (
		<Suspense fallback={<p role="status">{t('daily.loadingPuzzle')}</p>}>
			<Switch fallback={<p role="status">{t('daily.loadingPuzzle')}</p>}>
				<Match when={snapshot('locked')}>
					<div
						data-unlock-panel={archive ? 'archive' : 'picks'}
						class="mx-auto max-w-xl space-y-4 text-center"
					>
						<h2 class="flex items-center justify-center gap-2 font-display text-2xl">
							<Lock size={20} aria-hidden="true" />
							{t(archive ? 'plus.unlock.archiveTitle' : 'plus.unlock.title')}
						</h2>
						<a
							class={playButton}
							href={localizedPath(
								props.data.locale,
								`/pricing?${new URLSearchParams({ callbackUrl: returnTo(), trigger: 'game_unlock' })}`,
							)}
						>
							{t('plus.unlock.cta')}
						</a>
						<p>
							<a class="underline" href={props.data.catalog}>
								{t('plus.unlock.backToToday')}
							</a>
						</p>
					</div>
				</Match>
				<Match when={snapshot('completed')}>
					{(result) => (
						<div
							class="tactile-card mx-auto max-w-xl space-y-2 p-5 text-center"
							data-game-stage="completed"
						>
							<h2 class="font-display text-2xl">{t('daily.alreadyCompleted')}</h2>
							<p>
								{t(
									result().session.status === 'won'
										? 'daily.youSolvedTodays'
										: 'daily.youTriedTodays',
									{ game: props.data.name },
								)}
							</p>
							<Show when={result().session.difficulty}>
								{(level) => <p>{t(`common.difficulty.${level()}`)}</p>}
							</Show>
							<p>
								{t('gameResult.attempts')}: {result().session.attempts}
							</p>
							<p>{t('daily.comeBackTomorrow')}</p>
							<a class="inline-flex min-h-11 items-center underline" href={props.data.catalog}>
								{t('daily.backToGames')}
							</a>
						</div>
					)}
				</Match>
				<Match when={snapshot('closed')}>
					<p role="status">{t('daily.completedNoResult')}</p>
				</Match>
				<Match when={choose && (state() || isServer)}>
					<div class="mx-auto max-w-xl space-y-3">
						<h2 class="font-display text-2xl">{t('common.difficulty.selectDifficulty')}</h2>
						<Show when={snapshot('unavailable')}>
							<p class="text-sm text-muted-foreground">{t('daily.difficultyStatusUnverified')}</p>
						</Show>
						<ul class="grid gap-3 sm:grid-cols-3">
							<For each={props.data.difficultyLevels}>
								{(level) => (
									<li>
										<a
											class="tactile-card block h-full p-4"
											href={localizedPath(props.data.locale, todayPlayPath(slug, level.level))}
											onClick={(event) => {
												if (
													!event.defaultPrevented &&
													!event.shiftKey &&
													!event.metaKey &&
													!event.altKey &&
													!event.ctrlKey
												)
													markStartIntent(slug)
											}}
										>
											<span class="block font-display">{level.label}</span>
											<span class="text-sm text-muted-foreground">{level.description}</span>
										</a>
									</li>
								)}
							</For>
						</ul>
					</div>
				</Match>
				<Match when={snapshot('startable')}>
					{(value) =>
						board ? (
							<div class="mx-auto max-w-md space-y-4 text-center" data-game-stage="start">
								<p>{t('daily.startUsesPick')}</p>
								<button
									type="button"
									class={playButton}
									disabled={starting()}
									onClick={() => void play(value().puzzleDate)}
								>
									<Play size={16} aria-hidden="true" />
									{t(starting() ? 'daily.loadingPuzzle' : 'common.play')}
								</button>
							</div>
						) : (
							unavailable()
						)
					}
				</Match>
				<Match when={snapshot('playable')}>
					{(value) =>
						board ? (
							<div
								class="game-stage mx-auto flex min-h-[26rem] max-w-[34rem] flex-col"
								data-game-stage="board"
							>
								<div class="mb-3 flex flex-wrap items-center justify-between gap-2 rounded-xl border border-border bg-surface-muted px-4 py-2 text-sm">
									<time datetime={value().puzzleDate}>
										{new Intl.DateTimeFormat(props.data.locale, {
											dateStyle: 'medium',
											timeZone: 'UTC',
										}).format(new Date(value().puzzleDate))}
									</time>
									<a
										class="inline-flex min-h-11 items-center underline"
										href={
											!archive && props.data.difficultyLevels.length
												? `${props.data.canonicalPath}#play`
												: '#rules'
										}
									>
										{!archive && props.data.difficultyLevels.length
											? t('common.difficulty.selectDifficulty')
											: t('common.help')}
									</a>
								</div>
								<Dynamic
									component={board}
									puzzle={value()}
									locale={props.data.locale}
									difficulty={props.difficulty}
									onAlreadyPlayed={() => void refetch()}
								/>
							</div>
						) : (
							unavailable()
						)
					}
				</Match>
				<Match when={snapshot('unavailable')}>{unavailable()}</Match>
			</Switch>
		</Suspense>
	)
}
