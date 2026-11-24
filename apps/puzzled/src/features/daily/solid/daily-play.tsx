/** @jsxImportSource solid-js */
import { ConnectError } from '@connectrpc/connect'
import { ArrowLeft, CircleHelp, Lock, Play, SlidersHorizontal, X } from 'lucide-solid'
import {
	createEffect,
	createResource,
	createSignal,
	For,
	lazy,
	Match,
	onMount,
	Show,
	Suspense,
	Switch,
} from 'solid-js'
import { Dynamic } from 'solid-js/web'
import { sendFunnel } from '@/features/analytics/lib/funnel'
import type { GamePageData } from '@/features/catalog/solid/game-data'
import { playButton } from '@/features/catalog/solid/game-landing'
import type { PuzzleDifficulty } from '@/games/types'
import { isPlusRequiredError } from '@/lib/billing/plus'
import { startDaily } from '@/lib/connect/puzzle-client'
import { slugToCamelCase } from '@/lib/game-slug'
import { createTranslator } from '@/lib/i18n/translate'
import { localizedPath } from '@/lib/seo/urls'
import { classifyDailyResponse, type DailySnapshot, loadDailySnapshot } from '../lib/daily-fallback'
import { recordDailyPick } from '../lib/daily-picks'
import type { GameDayRequest } from '../lib/day-request'
import { markStartIntent, takeStartIntent } from '../lib/start-intent'
import { todayPlayPath } from '../lib/today-play-path'
import { ResultActions } from './result-actions'

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
	['word-guess', lazy(() => import('@/games/word-guess/solid-board'))],
	['cryptogram', lazy(() => import('@/games/cryptogram/solid-board'))],
	['word-box', lazy(() => import('@/games/word-box/solid-board'))],
	['arithmo', lazy(() => import('@/games/arithmo/solid-board'))],
	['block-slide', lazy(() => import('@/games/block-slide/solid-board'))],
	['crossword', lazy(() => import('@/games/crossword/solid-board'))],
	['pip-place', lazy(() => import('@/games/pip-place/solid-board'))],
	['quad-words', lazy(() => import('@/games/quad-words/solid-board'))],
	['word-hive', lazy(() => import('@/games/word-hive/solid-board'))],
])
const englishWordPuzzles = new Set([
	'word-guess',
	'quad-words',
	'word-ladder',
	'word-groups',
	'word-search',
	'cryptogram',
	'word-box',
	'word-hive',
	'crossword',
])

const arithmoFeedback = [
	['correct', 'border-correct bg-correct'],
	['present', 'border-present bg-present'],
	['absent', 'border-border bg-muted'],
] as const

type State = DailySnapshot | { kind: 'locked' }

const failed = (error: unknown): State =>
	isPlusRequiredError(ConnectError.from(error).rawMessage)
		? { kind: 'locked' }
		: { kind: 'unavailable' }

export function DailyPlay(props: {
	data: GamePageData
	day: GameDayRequest
	difficulty?: PuzzleDifficulty
	started: boolean
	initial?: State
}) {
	const t = createTranslator(props.data.locale)
	const slug = props.data.slug
	const archive = props.day.mode === 'archive'
	const choose = !archive && props.data.difficultyLevels.length > 0 && !props.difficulty
	const board = boards.get(slug)
	const [starting, setStarting] = createSignal(false)
	const [entered, setEntered] = createSignal(false)
	const input = { gameSlug: slug, difficulty: props.difficulty, puzzleDate: props.day.puzzleDate }
	const [mounted, setMounted] = createSignal(false)
	const [state, { mutate, refetch }] = createResource(
		mounted,
		async (_, { refetching }): Promise<State> => {
			// Keep the SSR snapshot on hydration; only a fallback or explicit retry reads again.
			if (!refetching && props.initial) return props.initial
			try {
				return await loadDailySnapshot(input)
			} catch (error) {
				return failed(error)
			}
		},
		{ initialValue: props.initial, ssrLoadFrom: 'initial' },
	)
	onMount(() => setMounted(true))
	const play = async (puzzleDate: string) => {
		if (starting() || !board) return
		setStarting(true)
		try {
			const next = classifyDailyResponse(await startDaily({ ...input, puzzleDate }))
			if (next.kind === 'playable') setEntered(true)
			mutate(next)
		} catch (error) {
			mutate(failed(error))
		} finally {
			setStarting(false)
		}
	}
	let handled = false
	createEffect(() => {
		const value = state()
		if (!value || handled || !props.started) return
		handled = true
		if (!archive && board && !choose && value.kind === 'startable' && takeStartIntent(slug))
			void play(value.puzzleDate)
	})
	const snapshot = <K extends State['kind']>(kind: K) => {
		const value = state.latest
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
							<ResultActions
								facts={{
									gameSlug: slug,
									mode: props.day.mode,
									status: result().session.status,
									puzzleDate: result().puzzleDate,
									attempts: result().session.attempts,
									score: result().session.score,
								}}
								locale={props.data.locale}
							/>
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
				<Match when={choose}>
					<div class="editorial-surface mx-auto max-w-xl space-y-3 rounded-3xl p-4 sm:p-5">
						<h2 class="font-display text-2xl">{t('common.difficulty.selectDifficulty')}</h2>
						<Show when={snapshot('unavailable')}>
							<p class="text-sm text-muted-foreground">{t('daily.difficultyStatusUnverified')}</p>
						</Show>
						<ul class="grid gap-3 sm:grid-cols-3">
							<For each={props.data.difficultyLevels}>
								{(level) => (
									<li>
										<a
											class="editorial-surface editorial-interactive block h-full rounded-2xl p-4"
											href={localizedPath(props.data.locale, todayPlayPath(slug, level.level))}
											data-start-intent={slug}
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
								<Show when={archive || props.started}>
									<button
										type="button"
										class={playButton}
										disabled={starting()}
										onClick={() => void play(value().puzzleDate)}
									>
										<Play size={16} aria-hidden="true" />
										{t(starting() ? 'daily.loadingPuzzle' : 'common.play')}
									</button>
								</Show>
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
								data-game-slug={slug}
								data-play-canvas={props.started || entered() || undefined}
							>
								<BoardIntro
									data={props.data}
									date={value().puzzleDate}
									changeDifficulty={!archive && props.data.difficultyLevels.length > 0}
								/>
								<div class="play-body">
									<Dynamic
										component={board}
										puzzle={value()}
										mode={props.day.mode}
										locale={props.data.locale}
										difficulty={props.difficulty}
										onAlreadyPlayed={() => void refetch()}
									/>
								</div>
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

function BoardIntro(props: { data: GamePageData; date: string; changeDifficulty: boolean }) {
	const t = createTranslator(props.data.locale)
	let rules: HTMLDialogElement | undefined
	const wordNotice = !props.data.locale.startsWith('en-') && englishWordPuzzles.has(props.data.slug)
	return (
		<header class="play-intro mb-2 text-sm">
			<div class="play-hud flex flex-wrap items-center gap-x-3">
				<a class="play-exit chrome-control hidden" href={props.data.catalog}>
					<ArrowLeft size={16} aria-hidden="true" />
					<span>{t('nav.games')}</span>
				</a>
				<h1 class="play-title hidden min-w-0 flex-1 font-display text-lg font-bold">
					{props.data.name}
				</h1>
				<time class="play-date mr-auto text-muted-foreground" datetime={props.date}>
					{new Intl.DateTimeFormat(props.data.locale, {
						dateStyle: 'medium',
						timeZone: 'UTC',
					}).format(new Date(props.date))}
				</time>
				<Show when={props.changeDifficulty}>
					<a class="chrome-control play-difficulty" href={`${props.data.canonicalPath}#play`}>
						<SlidersHorizontal size={15} class="hidden sm:block" aria-hidden="true" />
						{t('common.difficulty.selectDifficulty')}
					</a>
				</Show>
				<button
					type="button"
					class="chrome-control play-help"
					aria-haspopup="dialog"
					onClick={() => rules?.showModal()}
				>
					<CircleHelp size={16} aria-hidden="true" />
					<span>{t('common.help')}</span>
				</button>
			</div>
			<div class="play-cue">
				<p class="text-muted-foreground" data-first-action>
					{t(`daily.firstAction.${slugToCamelCase(props.data.slug)}`)}
				</p>
				<Show when={wordNotice}>
					<p
						class="mt-1 inline-flex rounded-full border border-border bg-background px-2 py-0.5 text-xs font-semibold"
						data-english-word-puzzle
					>
						{t('daily.englishWordPuzzle')}
					</p>
				</Show>
			</div>
			<dialog
				ref={rules}
				// Keep global board shortcuts from consuming keys meant for the dialog.
				on:keydown={(event) => event.stopPropagation()}
				aria-labelledby="play-rules-title"
				class="chrome-dialog"
			>
				<div class="mb-3 flex items-center justify-between gap-3">
					<h2 id="play-rules-title" class="font-display text-xl">
						{t('common.help')}
					</h2>
					<button
						type="button"
						class="chrome-control size-11 shrink-0 border border-hairline"
						aria-label={t('consent.close')}
						onClick={() => rules?.close()}
					>
						<X size={20} aria-hidden="true" />
					</button>
				</div>
				<ol class="list-decimal space-y-2 ps-5">
					<For each={props.data.rules}>{(rule) => <li>{rule}</li>}</For>
				</ol>
				<Show when={props.data.slug === 'arithmo'}>
					<ul class="mt-3 space-y-1 border-t border-border pt-3">
						<For each={arithmoFeedback}>
							{([tile, tone]) => (
								<li>
									<span
										aria-hidden="true"
										class={`me-2 inline-block size-3 rounded-sm border ${tone}`}
									/>
									{t(`games.arithmo.feedback.${tile}`)}
								</li>
							)}
						</For>
					</ul>
				</Show>
			</dialog>
		</header>
	)
}
