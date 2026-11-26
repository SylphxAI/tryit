/** @jsxImportSource solid-js */
import { Play } from 'lucide-solid'
import { Show } from 'solid-js'
import { markStartIntent } from '@/features/daily/lib/start-intent'
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
			onClick={(event) => {
				if (
					props.daily &&
					!event.defaultPrevented &&
					!event.metaKey &&
					!event.ctrlKey &&
					!event.altKey &&
					!event.shiftKey
				)
					markStartIntent(props.slug)
			}}
		>
			<Play class="h-4 w-4" fill="currentColor" aria-hidden="true" />
			{props.label}
		</a>
	)
}

export function renderPlayLink(props: GameLandingActionsProps) {
	const d = () => props.data
	const sudokuChoices = () => {
		if (!props.daily || props.difficulty || d().slug !== 'sudoku') return undefined
		const primary = d().difficultyLevels.find(({ level }) => level === DEFAULT_DAILY_DIFFICULTY)
		const easy = d().difficultyLevels.find(({ level }) => level === 'easy')
		return primary && easy ? { primary, easy } : undefined
	}
	return (
		<Show when={!props.locked}>
			<Show
				when={sudokuChoices()}
				fallback={
					<LandingPlayLink
						slug={d().slug}
						href={props.playHref}
						label={d().labels.play}
						class={playButton}
						daily={props.daily}
					/>
				}
			>
				{(choices) => (
					<fieldset class="min-w-0">
						<legend class="mb-2 text-sm font-semibold">{d().labels.play}</legend>
						<div class="flex flex-wrap items-center gap-2">
							<LandingPlayLink
								slug={d().slug}
								href={props.playHref}
								label={choices().primary.label}
								class="chrome-control chrome-primary min-h-14 gap-2 px-5 text-base font-bold"
								daily
							/>
							<LandingPlayLink
								slug={d().slug}
								href={localizedPath(d().locale, todayPlayPath(d().slug, choices().easy.level))}
								label={choices().easy.label}
								class="chrome-control min-h-12 gap-2 bg-foreground px-4 text-base font-bold text-background hover:bg-foreground/85"
								daily
							/>
						</div>
					</fieldset>
				)}
			</Show>
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
				class="chrome-control min-h-12 font-semibold underline"
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
