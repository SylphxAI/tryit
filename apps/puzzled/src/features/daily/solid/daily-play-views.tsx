/** @jsxImportSource solid-js */
import { type Accessor, Show } from 'solid-js'
import type { Translate } from '@/lib/i18n/translate'
import type { DailySnapshot } from '../lib/daily-fallback'
import type { DailyPlayProps } from './daily-play-state'
import { ResultActions } from './result-actions'

export function renderDailyCompletion(
	props: Pick<DailyPlayProps, 'data' | 'day' | 'todayKey'>,
	{
		t,
		slug,
		result,
		explicitPlay,
		isGuest,
		guestStatusPending,
		resultOpen,
		onDetailsOpenChange,
	}: {
		t: Translate
		slug: string
		result: Accessor<Extract<DailySnapshot, { kind: 'completed' }>>
		explicitPlay: boolean
		isGuest: Accessor<boolean | undefined>
		guestStatusPending: Accessor<boolean>
		resultOpen: Accessor<boolean>
		onDetailsOpenChange: (open: boolean) => void
	},
) {
	return (
		<div
			class="completion-card mx-auto max-w-xl space-y-2 text-center"
			classList={{ 'play-entry': explicitPlay }}
			data-game-stage="completed"
			data-result-open={resultOpen() || undefined}
		>
			<h2 class="font-display text-2xl">{t('daily.alreadyCompleted')}</h2>
			<p>
				{t(result().session.status === 'won' ? 'daily.youSolvedTodays' : 'daily.youTriedTodays', {
					game: props.data.name,
				})}
			</p>
			<Show when={result().session.difficulty}>
				{(level) => <p>{t(`common.difficulty.${level()}`)}</p>}
			</Show>
			<p>
				{t('gameResult.attempts')}: {result().session.attempts}
			</p>
			<ResultActions
				isGuest={isGuest()}
				guestStatusPending={guestStatusPending()}
				onDetailsOpenChange={onDetailsOpenChange}
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
	)
}
