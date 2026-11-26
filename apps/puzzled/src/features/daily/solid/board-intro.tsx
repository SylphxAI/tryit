/** @jsxImportSource solid-js */
import { ArrowLeft, CircleHelp, SlidersHorizontal, X } from 'lucide-solid'
import { For, Show } from 'solid-js'
import type { GamePageData } from '@/features/catalog/solid/game-data'
import { slugToCamelCase } from '@/lib/game-slug'
import { createTranslator } from '@/lib/i18n/translate'
import { needsEnglishWordNotice } from '../lib/english-word-puzzles'
import { DailyPickCount } from './daily-pick-count'

const arithmoFeedback = [
	['correct', 'border-correct bg-correct'],
	['present', 'border-present bg-present'],
	['absent', 'border-border bg-muted'],
] as const

export function BoardIntro(props: {
	data: GamePageData
	date?: string
	picks?: number
	locked: boolean
	changeDifficulty: boolean
	englishWordNoticeInHero: boolean
}) {
	const t = createTranslator(props.data.locale)
	let rules: HTMLDialogElement | undefined
	const wordNotice = () =>
		!props.englishWordNoticeInHero && needsEnglishWordNotice(props.data.locale, props.data.slug)
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
				<div
					class="play-cue"
					classList={{ 'cage-sudoku-cue': props.data.slug === 'killer-sudoku' }}
				>
					<p class="text-muted-foreground" data-first-action>
						{t(`daily.firstAction.${slugToCamelCase(props.data.slug)}`)}
						<Show when={props.data.slug === 'killer-sudoku'}>
							{' '}
							<span class="max-sm:block">{t('daily.cageSudokuCornerTotal')}</span>
							<span class="block">{t('daily.cageSudokuExample')}</span>
						</Show>
					</p>
					<Show when={wordNotice()}>
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
