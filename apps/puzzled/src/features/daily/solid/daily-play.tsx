/** @jsxImportSource solid-js */
import { ConnectError } from '@connectrpc/connect'
import { ArrowLeft, CircleHelp, Play, SlidersHorizontal, X } from 'lucide-solid'
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
import { getTodayProgress, startDaily } from '@/lib/connect/puzzle-client'
import { slugToCamelCase } from '@/lib/game-slug'
import { createTranslator } from '@/lib/i18n/translate'
import { localizedPath } from '@/lib/seo/urls'
import { classifyDailyResponse, type DailySnapshot, loadDailySnapshot } from '../lib/daily-fallback'
import { claimedDailyPicks, dailyPickCount } from '../lib/daily-picks'
import { rememberDailyLevel } from '../lib/daily-resume-path'
import type { GameDayRequest } from '../lib/day-request'
import { markStartIntent, takeStartIntent } from '../lib/start-intent'
import { todayPlayPath } from '../lib/today-play-path'
import { DailyPickCount } from './daily-pick-count'
import { DailyUnlock } from './daily-unlock'
import { readPlayGuestStatus } from './play-analytics-context'
import { readPlayDraftScope } from './play-scope'
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

type Playable = Extract<DailySnapshot, { kind: 'playable' }> & { draftScope?: string | null }
type State = Exclude<DailySnapshot, { kind: 'playable' }> | Playable | { kind: 'locked' }

async function withDraftScope(snapshot: State, archive: boolean): Promise<State> {
	if (archive || snapshot.kind !== 'playable' || !snapshot.puzzleId) return snapshot
	const draftScope = await readPlayDraftScope()
	return { ...snapshot, draftScope: draftScope ?? null }
}

const failed = (error: unknown): State =>
	isPlusRequiredError(ConnectError.from(error).rawMessage)
		? { kind: 'locked' }
		: { kind: 'unavailable' }

export function DailyPlay(props: {
	data: GamePageData
	day: GameDayRequest
	todayKey: string
	resetAt: number
	onLocked: () => void
	difficulty?: PuzzleDifficulty
	started: boolean
	initial?: State
}) {
	const t = createTranslator(props.data.locale)
	const slug = props.data.slug
	const archive = props.day.mode === 'archive'
	const choose = !archive && props.data.difficultyLevels.length > 0 && !props.difficulty
	const board = boards.get(slug)
	const explicitPlay = props.started && !choose && Boolean(board)
	const [starting, setStarting] = createSignal(false)
	const [resultOpen, setResultOpen] = createSignal(false)
	const [entered, setEntered] = createSignal(false)
	const input = { gameSlug: slug, difficulty: props.difficulty, puzzleDate: props.day.puzzleDate }
	const [mounted, setMounted] = createSignal(false)
	const [state, { mutate, refetch }] = createResource(
		mounted,
		async (_, { refetching }): Promise<State> => {
			// Keep the SSR snapshot on hydration; only a fallback or explicit retry reads again.
			if (!refetching && props.initial) return withDraftScope(props.initial, archive)
			try {
				return await withDraftScope(await loadDailySnapshot(input), archive)
			} catch (error) {
				return failed(error)
			}
		},
		{ initialValue: props.initial, ssrLoadFrom: 'initial' },
	)
	onMount(() => setMounted(true))
	const [isGuest] = createResource(mounted, () => readPlayGuestStatus().catch(() => undefined))
	const play = async (puzzleDate: string) => {
		if (starting() || !board) return
		setStarting(true)
		try {
			const next = await withDraftScope(
				classifyDailyResponse(await startDaily({ ...input, puzzleDate })),
				archive,
			)
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
		// Do not mount editable real boards until the scope read has settled.
		if (!archive && value?.kind === 'playable' && value.puzzleId && value.draftScope === undefined)
			return undefined
		return value?.kind === kind ? (value as Extract<State, { kind: K }>) : undefined
	}
	let seen = false
	createEffect(() => {
		const value = snapshot('playable')
		if (!value || seen || !board || choose) return
		seen = true
		sendFunnel({ event: 'game_start', game_slug: slug })
		if (!archive) rememberDailyLevel(value.puzzleDate, slug, props.difficulty)
	})
	createEffect(() => {
		if (snapshot('locked')) props.onLocked()
	})
	const [claimedPicks] = createResource(
		() => mounted() && !archive && snapshot('playable')?.puzzleDate,
		async (dayKey) => {
			try {
				const claimed = claimedDailyPicks(await getTodayProgress([]), dayKey)
				return claimed?.includes(slug) ? claimed : null
			} catch {
				return null
			}
		},
		{ initialValue: null },
	)
	const pickIndex = () => (claimedPicks.latest?.indexOf(slug) ?? -1) + 1
	const unavailable = () => (
		<div class="play-entry mx-auto max-w-md space-y-2 text-center">
			<h2 class="font-display text-xl">{t('daily.unavailableTitle')}</h2>
			<p>{t('daily.unavailableDescription')}</p>
			<button type="button" class={playButton} onClick={() => void refetch()}>
				{t('common.retry')}
			</button>
		</div>
	)

	const loading = () => (
		<p class="play-entry text-center" role="status">
			{t('daily.loadingPuzzle')}
		</p>
	)
	const intro = (date: () => string | undefined) => (
		<BoardIntro
			data={props.data}
			date={date()}
			picks={
				snapshot('playable') && claimedPicks.latest
					? dailyPickCount(claimedPicks.latest)
					: undefined
			}
			locked={Boolean(snapshot('locked'))}
			changeDifficulty={!archive && props.data.difficultyLevels.length > 0}
		/>
	)
	const content = () => (
		<Switch fallback={loading()}>
			<Match when={snapshot('locked')}>
				<DailyUnlock
					data={props.data}
					day={props.day}
					todayKey={props.todayKey}
					resetAt={props.resetAt}
					isGuest={isGuest.latest}
				/>
			</Match>
			<Match when={snapshot('completed')}>
				{(result) => (
					<div
						class="completion-card mx-auto max-w-xl space-y-2 text-center"
						classList={{ 'play-entry': explicitPlay }}
						data-game-stage="completed"
						data-result-open={resultOpen() || undefined}
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
							onDetailsOpenChange={setResultOpen}
							facts={{
								gameSlug: slug,
								mode: props.day.mode,
								status: result().session.status,
								puzzleDate: result().puzzleDate,
								todayKey: props.todayKey,
								attempts: result().session.attempts,
								difficulty: result().session.difficulty,
								score: result().session.score,
								timeSpentMs: result().session.timeSpentMs,
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
						<div class="play-entry mx-auto max-w-md space-y-4 text-center" data-game-stage="start">
							<p>{t('daily.startUsesPick')}</p>
							<Show when={archive || props.started}>
								<button
									type="button"
									class={playButton}
									disabled={starting()}
									aria-busy={starting()}
									onClick={() => void play(value().puzzleDate)}
								>
									<Play size={16} aria-hidden="true" />
									{t('common.play')}
								</button>
							</Show>
						</div>
					) : (
						unavailable()
					)
				}
			</Match>
			<Match when={snapshot('playable')}>
				{(value) => {
					if (!board) return unavailable()
					const puzzle = () => (
						<Dynamic
							component={board}
							puzzle={value()}
							todayKey={props.todayKey}
							mode={props.day.mode}
							locale={props.data.locale}
							difficulty={props.difficulty}
							draftScope={value().draftScope ?? undefined}
							isGuest={isGuest.latest}
							pickIndex={pickIndex()}
							onAlreadyPlayed={() => void refetch()}
						/>
					)
					return explicitPlay ? (
						puzzle()
					) : (
						<div
							class="game-stage mx-auto flex min-h-[26rem] max-w-[34rem] flex-col"
							data-game-stage="board"
							data-game-slug={slug}
							data-play-canvas={entered() || undefined}
						>
							{intro(() => value().puzzleDate)}
							<div class="play-body">{puzzle()}</div>
						</div>
					)
				}}
			</Match>
			<Match when={snapshot('unavailable')}>{unavailable()}</Match>
		</Switch>
	)

	// Keep the viewport shell and HUD outside Suspense. Fetching a snapshot,
	// waiting for a start, and importing the board all share the same scrollport.
	if (explicitPlay) {
		const date = () => {
			const value = state.latest
			return value && 'puzzleDate' in value ? value.puzzleDate : props.day.puzzleDate
		}
		return (
			<div
				class="game-stage mx-auto flex flex-col"
				data-game-stage={snapshot('playable') ? 'board' : undefined}
				data-game-slug={slug}
				data-play-canvas=""
			>
				{intro(date)}
				<div class="play-body">
					<Suspense fallback={loading()}>{content()}</Suspense>
				</div>
			</div>
		)
	}
	return <Suspense fallback={loading()}>{content()}</Suspense>
}

function BoardIntro(props: {
	data: GamePageData
	date?: string
	picks?: number
	locked: boolean
	changeDifficulty: boolean
}) {
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
				<div class="play-date mr-auto flex flex-wrap items-center gap-x-2 text-muted-foreground">
					<time datetime={props.date}>
						<Show when={props.date}>
							{(date) =>
								new Intl.DateTimeFormat(props.data.locale, {
									dateStyle: 'medium',
									timeZone: 'UTC',
								}).format(new Date(date()))
							}
						</Show>
					</time>
					<Show when={props.picks !== undefined}>
						<span aria-hidden="true">·</span>
						<DailyPickCount locale={props.data.locale} count={props.picks ?? 0} />
					</Show>
				</div>
				<Show when={props.changeDifficulty && !props.locked}>
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
			<Show when={!props.locked}>
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
			</Show>
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
