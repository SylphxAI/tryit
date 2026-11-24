/** @jsxImportSource solid-js */

import { Check, LockKeyhole, Play } from 'lucide-solid'
import { createMemo, createSignal, For } from 'solid-js'
import { type GameColorTheme, gameFamilyColor, getGameColors } from '@/games/theme-colors'
import type { GameCategory } from '@/games/types'
import { localizedPath } from '@/lib/seo/urls'
import { cn } from '@/lib/utils'
import { archivePlayPath } from '../lib/archive-days'

export type AlmanacGame = {
	slug: string
	name: string
	theme: GameColorTheme
	category: GameCategory
}

type ArchiveAlmanacProps = {
	/** Past product days, newest first (`archiveDayKeys`). */
	days: readonly string[]
	games: readonly AlmanacGame[]
	locale: string
	/** Past days need Tryit Plus for this viewer; the preview stays visible. */
	locked: boolean
	categories: readonly { value: GameCategory; label: string }[]
	labels: {
		dayPicker: string
		filter: string
		all: string
		yesterday: string
		dayCount: string
		play: string
		locked: string
	}
}

type Filter = 'all' | GameCategory

const FAMILY_TONE: Record<Filter, string> = {
	all: '[--family-color:var(--color-foreground)]',
	...gameFamilyColor,
}

/**
 * The archive as an almanac: a strip of the past days, a category filter and
 * the chosen day's games. One day is on screen at a time, so the whole month
 * fits in one view. Connect alone admits dated play; this only links.
 */
export function ArchiveAlmanac(props: ArchiveAlmanacProps) {
	const [selected, setSelected] = createSignal(props.days[0] ?? '')
	const [filter, setFilter] = createSignal<Filter>('all')

	const formats = createMemo(() => ({
		weekday: new Intl.DateTimeFormat(props.locale, { weekday: 'short', timeZone: 'UTC' }),
		day: new Intl.DateTimeFormat(props.locale, { day: 'numeric', timeZone: 'UTC' }),
		count: new Intl.NumberFormat(props.locale),
		month: new Intl.DateTimeFormat(props.locale, { month: 'short', timeZone: 'UTC' }),
		long: new Intl.DateTimeFormat(props.locale, {
			weekday: 'long',
			month: 'long',
			day: 'numeric',
			year: 'numeric',
			timeZone: 'UTC',
		}),
	}))
	const asDate = (dayKey: string) => new Date(`${dayKey}T00:00:00Z`)
	const visible = createMemo(() =>
		filter() === 'all' ? props.games : props.games.filter((game) => game.category === filter()),
	)

	return (
		<div
			class="editorial-surface rounded-3xl border border-hairline bg-card shadow-md"
			data-archive-almanac=""
		>
			<div class="rounded-t-3xl border-b border-hairline bg-surface-muted/65 px-3.5 pb-3.5 pt-4 sm:px-6 sm:pb-5 sm:pt-5">
				<fieldset class="min-w-0 border-0 p-0">
					<legend class="eyebrow">{props.labels.dayPicker}</legend>
					<ul class="-mx-1 mt-1.5 flex snap-x gap-1.5 overflow-x-auto scroll-px-1 px-1 pt-1 pb-2 [scrollbar-color:var(--color-input)_transparent] [scrollbar-width:thin] sm:gap-2">
						<For each={props.days}>
							{(dayKey, index) => {
								const date = asDate(dayKey)
								const on = () => dayKey === selected()
								const monthStart = dayKey.slice(0, 7) !== props.days[index() - 1]?.slice(0, 7)
								return (
									<li class="snap-start">
										<button
											type="button"
											aria-pressed={on()}
											aria-label={formats().long.format(date)}
											onClick={() => setSelected(dayKey)}
											class={cn(
												'flex min-h-19 min-w-14 cursor-pointer flex-col items-center justify-center gap-1.5 rounded-xl border px-2.5 py-2 font-semibold whitespace-nowrap transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring sm:min-h-21 sm:min-w-16',
												on()
													? 'border-accent-warm-foreground/30 bg-accent-warm-soft text-accent-warm-foreground'
													: 'border-hairline bg-card text-muted-foreground hover:border-muted-foreground/40 hover:text-foreground',
											)}
										>
											<span class="text-[11px] leading-none">
												{index() === 0 ? props.labels.yesterday : formats().weekday.format(date)}
											</span>
											<span class="font-sans text-2xl leading-none font-bold text-foreground tabular-nums">
												{formats().day.format(date)}
											</span>
											<span class="text-[11px] leading-none">
												{monthStart ? formats().month.format(date) : ' '}
											</span>
										</button>
									</li>
								)
							}}
						</For>
					</ul>
				</fieldset>
				<fieldset class="mt-3 min-w-0 border-0 p-0 sm:mt-4">
					<legend class="eyebrow">{props.labels.filter}</legend>
					<div class="mt-2 flex flex-wrap gap-1.5 sm:gap-2">
						<For each={[{ value: 'all' as const, label: props.labels.all }, ...props.categories]}>
							{(option) => (
								<button
									type="button"
									aria-pressed={filter() === option.value}
									onClick={() => setFilter(option.value)}
									class={cn(
										'inline-flex min-h-11 cursor-pointer items-center gap-1.5 rounded-full border px-3 py-1.5 text-sm font-semibold text-[var(--family-color)] transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring',
										FAMILY_TONE[option.value],
										filter() === option.value
											? 'border-[color-mix(in_srgb,var(--family-color)_55%,transparent)] bg-[color-mix(in_srgb,var(--family-color)_18%,var(--color-card))]'
											: 'border-transparent bg-[color-mix(in_srgb,var(--family-color)_8%,var(--color-card))] hover:border-[color-mix(in_srgb,var(--family-color)_35%,transparent)]',
									)}
								>
									{filter() === option.value && (
										<Check size={14} class="shrink-0" aria-hidden="true" />
									)}
									{option.label}
								</button>
							)}
						</For>
					</div>
				</fieldset>
			</div>

			<section class="px-3.5 pt-4 pb-4 sm:px-6 sm:py-6" aria-labelledby="archive-day-title">
				<div class="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
					<h3
						id="archive-day-title"
						class="font-display text-xl leading-tight tabular-nums sm:text-2xl [&:is(:lang(zh),:lang(ja),:lang(ko))]:tracking-normal"
					>
						<time datetime={selected()}>{formats().long.format(asDate(selected()))}</time>
					</h3>
					<p class="text-sm font-medium text-muted-foreground tabular-nums">
						{props.labels.dayCount.replace('{count}', formats().count.format(visible().length))}
					</p>
				</div>
				{props.locked ? (
					<p id="archive-locked-description" class="sr-only">
						{props.labels.locked}
					</p>
				) : null}
				<ul class="mt-3 grid grid-cols-2 gap-2.5 sm:mt-4 sm:grid-cols-3 sm:gap-3 xl:grid-cols-4">
					<For each={visible()}>
						{(game) => {
							const colors = getGameColors(game.theme)
							return (
								<li class="min-w-0">
									<a
										href={localizedPath(props.locale, archivePlayPath(game.slug, selected()))}
										aria-describedby={props.locked ? 'archive-locked-description' : undefined}
										class="editorial-surface editorial-interactive flex h-full min-h-17 items-center gap-2 rounded-xl border border-hairline bg-card p-2 shadow-md hover:border-muted-foreground/30 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring motion-safe:transition-[transform,box-shadow,border-color] motion-safe:hover:-translate-y-0.5 motion-safe:active:scale-[0.99] sm:gap-3 sm:p-2.5"
									>
										<span
											class={cn(
												'flex h-9 w-10 shrink-0 items-center justify-center overflow-hidden rounded-lg p-0.5 sm:h-11 sm:w-13',
												colors.bgLight,
											)}
											aria-hidden="true"
										>
											<img
												src={`/motifs/${game.slug}-zoom.svg`}
												alt=""
												width={132}
												height={84}
												loading="lazy"
												decoding="async"
												class="block h-full w-full object-contain"
											/>
										</span>
										<span class="min-w-0 flex-1">
											<span class="block text-sm leading-tight font-bold [overflow-wrap:anywhere]">
												{game.name}
											</span>
											{!props.locked ? (
												<span class="mt-1 flex items-center gap-1 text-xs leading-tight text-muted-foreground">
													<Play class="size-3 shrink-0" aria-hidden="true" />
													{props.labels.play}
												</span>
											) : null}
										</span>
										{props.locked ? (
											<LockKeyhole
												class="size-3.5 shrink-0 text-muted-foreground"
												aria-hidden="true"
											/>
										) : null}
									</a>
								</li>
							)
						}}
					</For>
				</ul>
			</section>
		</div>
	)
}
