/** @jsxImportSource solid-js */
import { Play } from 'lucide-solid'
import { createSignal, Match, Show, Suspense, Switch } from 'solid-js'
import { Dynamic } from 'solid-js/web'
import { playButton } from '@/features/catalog/solid/game-landing'
import { gameBoards } from '@/games/shared/solid/board-registry'
import { createTranslator } from '@/lib/i18n/translate'
import { dailyPickCount } from '../lib/daily-picks'
import { BoardIntro } from './board-intro'
import { createDailyPlayState, type DailyPlayProps } from './daily-play-state'
import { renderDailyCompletion, renderDailyDifficulty } from './daily-play-views'
import { DailyUnlock } from './daily-unlock'

export function DailyPlay(props: DailyPlayProps) {
	const t = createTranslator(props.data.locale)
	const slug = props.data.slug
	const archive = props.day.mode === 'archive'
	const choose = !archive && props.data.difficultyLevels.length > 0 && !props.difficulty
	const board = gameBoards.get(slug)
	const explicitPlay = props.started && !choose && Boolean(board)
	const [resultOpen, setResultOpen] = createSignal(false)
	const { state, refetch, isGuest, starting, entered, play, snapshot, claimedPicks, pickIndex } =
		createDailyPlayState(props, { slug, archive, choose, hasBoard: Boolean(board) })

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
				{(result) =>
					renderDailyCompletion(props, {
						t,
						slug,
						result,
						explicitPlay,
						isGuest: () => isGuest.latest,
						guestStatusPending: () => isGuest.loading,
						resultOpen,
						onDetailsOpenChange: setResultOpen,
					})
				}
			</Match>
			<Match when={snapshot('closed')}>
				<p role="status">{t('daily.completedNoResult')}</p>
			</Match>
			<Match when={choose}>
				{renderDailyDifficulty(props, { t, slug, unavailable: () => snapshot('unavailable') })}
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
							guestStatusPending={isGuest.loading}
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
