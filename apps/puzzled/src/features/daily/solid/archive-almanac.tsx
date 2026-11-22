/** @jsxImportSource solid-js */

import { LockKeyhole, Play } from 'lucide-solid'
import { createMemo, createSignal, For } from 'solid-js'
import { type GameColorTheme, getGameColors } from '@/games/theme-colors'
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
		<div class="tactile-card overflow-hidden" data-archive-almanac="">
			<div class="border-b-[1.5px] border-[var(--tactile-line)] bg-[var(--color-surface-muted)] px-3 pb-3 pt-3 sm:px-4">
				<fieldset class="min-w-0 border-0 p-0">
					<legend class="sr-only">{props.labels.dayPicker}</legend>
					<ul class="no-scrollbar -mx-3 flex snap-x gap-1.5 overflow-x-auto px-3 pb-1 sm:-mx-4 sm:px-4">
						<For each={props.days}>
							{(dayKey, index) => {
								const date = asDate(dayKey)
								const on = () => dayKey === selected()
								const monthStart = index() === 0 || date.getUTCDate() === 1
								return (
									<li class="snap-start">
										<button
											type="button"
											aria-pressed={on()}
											aria-label={formats().long.format(date)}
											onClick={() => setSelected(dayKey)}
											class={cn('almanac-day', on() && 'almanac-day-on')}
										>
											<span class="text-[11px] font-semibold uppercase leading-none tracking-wide opacity-75">
												{index() === 0 ? props.labels.yesterday : formats().weekday.format(date)}
											</span>
											<span class="numeral font-display text-lg font-bold leading-none">
												{formats().day.format(date)}
											</span>
											<span class="text-[10px] font-semibold leading-none opacity-70">
												{monthStart ? formats().month.format(date) : ' '}
											</span>
										</button>
									</li>
								)
							}}
						</For>
					</ul>
				</fieldset>
				<fieldset class="mt-2 min-w-0 border-0 p-0">
					<legend class="sr-only">{props.labels.filter}</legend>
					<div class="no-scrollbar -mx-3 flex gap-1.5 overflow-x-auto px-3 sm:-mx-4 sm:px-4">
						<For each={[{ value: 'all' as const, label: props.labels.all }, ...props.categories]}>
							{(option) => (
								<button
									type="button"
									aria-pressed={filter() === option.value}
									onClick={() => setFilter(option.value)}
									class={cn(
										'category-chip shrink-0',
										filter() === option.value && 'category-chip-on',
									)}
								>
									{option.label}
								</button>
							)}
						</For>
					</div>
				</fieldset>
			</div>

			<section class="px-3 pb-4 pt-3 sm:px-4" aria-labelledby="archive-day-title">
				<div class="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
					<h3 id="archive-day-title" class="font-display text-xl leading-tight">
						<time datetime={selected()}>{formats().long.format(asDate(selected()))}</time>
					</h3>
					<p class="numeral text-sm text-muted-foreground">
						{props.labels.dayCount.replace('{count}', String(visible().length))}
					</p>
				</div>
				<ul class="mt-3 grid grid-cols-2 gap-2.5 sm:grid-cols-3 lg:grid-cols-4">
					<For each={visible()}>
						{(game) => {
							const colors = getGameColors(game.theme)
							return (
								<li>
									<a
										href={localizedPath(props.locale, archivePlayPath(game.slug, selected()))}
										class="almanac-game group flex items-center gap-2 sm:gap-2.5"
									>
										<span
											class={cn(
												'flex h-9 w-12 shrink-0 items-center justify-center overflow-hidden rounded-lg border-[1.5px] border-[var(--tactile-line)] p-0.5 sm:h-11 sm:w-[4.25rem]',
												colors.bg,
											)}
											aria-hidden="true"
										>
											{/* biome-ignore lint/performance/noImgElement: a static decorative SVG with intrinsic size */}
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
											<span class="block truncate text-sm font-semibold leading-snug">
												{game.name}
											</span>
											<span class="mt-0.5 flex items-center gap-1 text-xs text-muted-foreground">
												{props.locked ? (
													<LockKeyhole class="h-3 w-3 shrink-0" aria-hidden="true" />
												) : (
													<Play class="h-3 w-3 shrink-0" aria-hidden="true" />
												)}
												{props.locked ? props.labels.locked : props.labels.play}
											</span>
										</span>
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
