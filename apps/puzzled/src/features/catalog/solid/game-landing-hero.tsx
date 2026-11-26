/** @jsxImportSource solid-js */
import { Clock } from 'lucide-solid'
import { Show } from 'solid-js'
import { getGameColors } from '@/games/theme-colors'
import { createTranslator } from '@/lib/i18n/translate'
import {
	type GameLandingActionsProps,
	renderGuestPrompt,
	renderPlayLink,
	renderPracticeLink,
} from './game-landing-actions'

export type GameLandingHeroProps = GameLandingActionsProps & {
	stage: boolean
	practice?: boolean
	englishWordNoticeInHero: boolean
}

export function renderGameLandingHeroBody(props: GameLandingHeroProps) {
	const d = () => props.data
	const t = () => d().labels
	const color = () => getGameColors(d().theme).bg
	const title = () => (
		<h1
			class={
				props.stage
					? 'font-display text-2xl leading-tight md:text-[1.75rem]'
					: 'font-display text-[2.5rem] leading-[1.02] text-balance md:text-6xl'
			}
		>
			{d().name}
		</h1>
	)
	const motif = () => (
		<img
			src={`/motifs/${d().slug}.svg`}
			alt=""
			width="160"
			height="100"
			class="h-full w-full object-contain"
		/>
	)
	const facts = () => (
		<ul class="flex flex-wrap items-center gap-1.5 text-xs font-medium">
			<li class="tag-chip numeral">
				<Clock class="h-3 w-3" aria-hidden="true" />
				{d().duration}
			</li>
			<li class="tag-chip">{d().category}</li>
			<Show when={d().highlight}>
				<li class="tag-chip">{d().highlight}</li>
			</Show>
			<Show when={d().difficultyLevels.length}>
				<li class="tag-chip">
					{d()
						.difficultyLevels.map(({ label }) => label)
						.join(' / ')}
				</li>
			</Show>
			<Show when={props.englishWordNoticeInHero}>
				<li class="tag-chip font-semibold" data-english-word-puzzle>
					{createTranslator(d().locale)('daily.englishWordPuzzle')}
				</li>
			</Show>
		</ul>
	)
	const featured = () => (
		<Show when={d().featured && !props.practice}>
			<span class="inline-flex rounded-full bg-foreground px-2.5 py-1 text-xs font-semibold text-background">
				{t().featured}
			</span>
		</Show>
	)

	return (
		<Show
			when={!props.stage}
			fallback={
				<div class="flex flex-wrap items-center gap-3">
					{title()}
					{featured()}
					<div class="hidden md:block">{facts()}</div>
				</div>
			}
		>
			<div class="mt-1 grid items-center gap-6 md:grid-cols-[minmax(0,1fr)_minmax(0,24rem)] md:gap-10 lg:grid-cols-[minmax(0,1fr)_minmax(0,27rem)]">
				<div class="min-w-0">
					{featured()}
					<div class="mt-3 flex items-center justify-between gap-4">
						{title()}
						<div
							class={`editorial-surface h-16 w-[6.25rem] shrink-0 overflow-hidden rounded-xl p-1 md:hidden ${color()}`}
						>
							{motif()}
						</div>
					</div>
					<p class="mt-3 max-w-xl text-[17px] leading-relaxed text-muted-foreground">
						{d().description}
					</p>
					<div class="mt-4">{facts()}</div>
					<div class="flex flex-wrap items-center gap-x-4 gap-y-2 empty:hidden mt-6">
						{renderPlayLink(props)}
						{renderPracticeLink(props)}
					</div>
					{renderGuestPrompt(props)}
				</div>
				<div
					class={`editorial-surface hidden aspect-[16/10] rounded-3xl overflow-hidden p-4 md:block ${color()}`}
				>
					{motif()}
				</div>
			</div>
		</Show>
	)
}
