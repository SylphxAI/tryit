/** @jsxImportSource solid-js */
import { type Accessor, For, Show } from 'solid-js'
import type { Translate } from '@/lib/i18n/translate'
import { localizedPath } from '@/lib/seo/urls'
import type { DailySnapshot } from '../lib/daily-fallback'
import { todayPlayPath } from '../lib/today-play-path'
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

export function renderDailyDifficulty(
	props: Pick<DailyPlayProps, 'data'>,
	{
		t,
		slug,
		unavailable,
	}: {
		t: Translate
		slug: string
		unavailable: Accessor<Extract<DailySnapshot, { kind: 'unavailable' }> | undefined>
	},
) {
	return (
		<div class="editorial-surface mx-auto max-w-xl space-y-3 rounded-3xl p-4 sm:p-5">
			<h2 class="font-display text-2xl">{t('common.difficulty.selectDifficulty')}</h2>
			<Show when={unavailable()}>
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
							>
								<span class="block font-display">{level.label}</span>
								<span class="text-sm text-muted-foreground">{level.description}</span>
							</a>
						</li>
					)}
				</For>
			</ul>
		</div>
	)
}
