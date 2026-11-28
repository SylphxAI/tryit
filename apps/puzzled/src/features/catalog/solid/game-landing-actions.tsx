/** @jsxImportSource solid-js */
import { Play } from 'lucide-solid'
import { For, Show } from 'solid-js'
import { DEFAULT_DAILY_DIFFICULTY, todayPlayPath } from '@/features/daily/lib/today-play-path'
import { isPracticeSupported, practicePath } from '@/features/practice/lib/practice'
import type { PuzzleDifficulty } from '@/games/types'
import { createTranslator } from '@/lib/i18n/translate'
import { localizedPath } from '@/lib/seo/urls'
import type { GamePageData } from './game-data'

export const playButton = 'chrome-control chrome-primary min-h-12 gap-2 px-7 text-base font-bold'

export type GameLandingActionsProps = {
	data: GamePageData
	locked: boolean
	playHref: string
	daily: boolean
	chooseDifficulty: boolean
	showDifficulty: boolean
	difficulty?: PuzzleDifficulty
	signedIn: boolean
}

function LandingPlayLink(props: {
	slug: string
	href: string
	label: string
	class: string
	daily: boolean
}) {
	return (
		<a
			href={props.href}
			data-start-intent={props.daily ? props.slug : undefined}
			class={props.class}
		>
			<Play class="h-4 w-4" fill="currentColor" aria-hidden="true" />
			{props.label}
		</a>
	)
}

export function renderPlayLink(props: GameLandingActionsProps) {
	return (
		<Show when={!props.locked && !props.chooseDifficulty}>
			<LandingPlayLink
				slug={props.data.slug}
				href={props.playHref}
				label={props.data.labels.play}
				class={playButton}
				daily={props.daily}
			/>
		</Show>
	)
}

export function renderDifficultyPicker(props: GameLandingActionsProps) {
	const d = () => props.data
	const t = () => createTranslator(d().locale)
	const levels = () => d().difficultyLevels
	const defaultLevel = () =>
		levels().find(({ level }) => level === DEFAULT_DAILY_DIFFICULTY)?.level ?? levels()[0]?.level

	// Native checked state exposes only the selected link, even before hydration.
	return (
		<Show when={props.showDifficulty}>
			<fieldset
				id="play"
				aria-describedby="daily-pick-note"
				class="mt-5 min-w-0 max-w-sm scroll-mt-16"
			>
				<legend class="mb-2 font-display text-base font-bold">
					{t()('common.difficulty.selectDifficulty')}
				</legend>
				<div class="flex flex-wrap gap-2">
					<For each={levels()}>
						{(level) => (
							<div class="group/level contents">
								<label class="flex min-h-12 min-w-0 flex-1 cursor-pointer items-center justify-center gap-1.5 rounded-xl border border-border bg-card px-1.5 py-1 text-center text-sm font-semibold hover:bg-accent has-checked:border-foreground has-checked:bg-accent">
									<input
										class="size-4 shrink-0 accent-foreground"
										type="radio"
										name="daily-difficulty"
										value={level.level}
										checked={level.level === defaultLevel()}
									/>
									{level.label}
								</label>
								<p class="order-1 hidden w-full text-sm text-muted-foreground group-has-checked/level:block">
									{level.description}
								</p>
								<LandingPlayLink
									slug={d().slug}
									href={localizedPath(d().locale, todayPlayPath(d().slug, level.level))}
									label={d().labels.play}
									class={`${playButton} order-3 hidden w-full group-has-checked/level:inline-flex`}
									daily
								/>
							</div>
						)}
					</For>
					<p id="daily-pick-note" class="order-2 w-full text-sm text-muted-foreground">
						{t()('daily.startUsesPick')}
					</p>
				</div>
			</fieldset>
		</Show>
	)
}

export function renderPracticeLink(
	props: Pick<GameLandingActionsProps, 'data' | 'daily' | 'difficulty'>,
) {
	const d = () => props.data
	return (
		<Show when={props.daily && isPracticeSupported(d().slug)}>
			<a
				class="chrome-control min-h-12 min-w-12 justify-start ps-0 font-semibold underline"
				href={practicePath(d().canonicalPath, props.difficulty)}
			>
				{createTranslator(d().locale)('practice.label')}
			</a>
		</Show>
	)
}

export function renderGuestPrompt(props: Pick<GameLandingActionsProps, 'data' | 'signedIn'>) {
	const d = () => props.data
	const t = () => d().labels
	return (
		<Show when={!props.signedIn}>
			<p class="mt-2 text-sm text-muted-foreground">
				{t().guest}{' '}
				<a
					class="chrome-control text-foreground"
					href={localizedPath(
						d().locale,
						`/sign-in?${new URLSearchParams({ callbackUrl: d().canonicalPath })}`,
					)}
				>
					{t().signup}
				</a>
			</p>
		</Show>
	)
}
