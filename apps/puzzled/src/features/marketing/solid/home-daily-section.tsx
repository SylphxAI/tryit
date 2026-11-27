/** @jsxImportSource solid-js */
import { type Accessor, createMemo, For, Show, Suspense } from 'solid-js'
import { DAILY_FREE_PICKS } from '@/features/daily/lib/daily-picks'
import { summarizeDailyProgress } from '@/features/daily/lib/daily-progress'
import { deriveHomeExposure } from '@/features/daily/lib/home-exposure'
import { deriveHomePlayState, scopeHomePlayState } from '@/features/daily/lib/home-play-state'
import { markStartIntent } from '@/features/daily/lib/start-intent'
import { DailyPickCount } from '@/features/daily/solid/daily-pick-count'
import { formatCountdown } from '@/features/home/lib/day-boundary'
import { homeDayCopy } from '@/features/home/lib/home-day-copy'
import type { Translate } from '@/lib/i18n/translate'
import type { HomeDocument, HomeFacts } from './home-data'
import { HomeDayLead } from './home-day-lead'
import { HomeLineup } from './home-lineup'

function markStart(event: MouseEvent, slug: string) {
	if (
		!event.defaultPrevented &&
		!event.metaKey &&
		!event.ctrlKey &&
		!event.shiftKey &&
		!event.altKey
	)
		markStartIntent(slug)
}

export function HomeDailySection(props: {
	page: HomeDocument
	facts: Accessor<HomeFacts | undefined>
	t: Translate
	href: (path: string) => string
	now: Accessor<number>
	format: Intl.NumberFormat
}) {
	const { page, t, href, now } = props
	const count = page.catalog.length
	const status = createMemo(() => {
		const results = props.facts()?.results ?? {}
		const freeGameSlug = page.featured.slug
		const state = deriveHomePlayState({
			gameSlugs: page.catalog.map((game) => game.slug),
			personalResults: results,
			freeGameSlug,
		})
		const slugs = props.facts()
			? deriveHomeExposure({
					modules: page.catalog,
					freeGameSlug,
					completions: results,
					dayKey: page.dayKey,
					limit: count,
				}).slugs
			: page.fallbackOrder
		const scoped = scopeHomePlayState(state, slugs)
		return {
			...scoped,
			progress: summarizeDailyProgress(scoped.progressGames),
			unread: state.hasUnverifiedStatus,
		}
	})
	const copy = createMemo(() =>
		homeDayCopy({
			isMember: props.facts()?.member === true,
			allDone: status().progress.allCompleted,
			freeGameDone: status().renderedGames[0]?.completed === true,
			currentStreak: props.facts()?.streak?.currentStreak ?? 0,
			hasPlayedToday: props.facts()?.streak?.hasPlayedToday ?? false,
		}),
	)
	const picks = () => props.facts()?.freePicks
	const pickLabel = () => <DailyPickCount locale={page.locale} count={picks() ?? 0} />
	const pickSlots = () => (
		<span class="flex items-center gap-1" aria-hidden="true">
			<For each={Array.from({ length: DAILY_FREE_PICKS })}>
				{(_, index) => (
					<span class="picks-slot" classList={{ 'picks-slot-used': index() < (picks() ?? 0) }} />
				)}
			</For>
		</span>
	)
	return (
		<section class="home-hero day-surface relative">
			<div class="home-day-shell page-shell-wide pt-2 md:pt-5">
				<div class="home-day-masthead masthead-rule flex flex-wrap items-center justify-between gap-x-3 gap-y-1 py-1.5 text-sm text-muted-foreground sm:gap-y-3 sm:py-2">
					<p class="day-numeral font-semibold text-foreground">
						{t('home.day.puzzleNumber', { number: page.puzzleNumber })} ·{' '}
						{t('home.lineup.subtitleShort', { count })}
					</p>
					<Suspense fallback={null}>
						<Show
							when={props.facts()?.unlimited}
							fallback={
								<Show
									when={picks() === DAILY_FREE_PICKS}
									fallback={
										<Show when={picks() !== undefined}>
											<p data-daily-picks={picks()} class="picks-pill">
												{pickSlots()}
												{pickLabel()}
											</p>
										</Show>
									}
								>
									<a
										data-daily-picks={picks()}
										class="picks-pill picks-pill-link"
										href={href('/pricing?entry_surface=picks_pill')}
									>
										{pickSlots()}
										{pickLabel()}
									</a>
								</Show>
							}
						>
							<p data-daily-picks="unlimited" class="picks-pill">
								<span class="picks-slot picks-slot-plus" aria-hidden="true" />
								{t('home.picks.unlimited')}
							</p>
						</Show>
					</Suspense>
					<p class="whitespace-nowrap" title={t('home.day.resetsAt')}>
						{t('home.day.resetsIn')}{' '}
						<time
							data-home-countdown
							data-reset-at={new Date(page.resetAt).toISOString()}
							class="numeral font-semibold text-foreground"
						>
							{formatCountdown(page.resetAt - now())}
						</time>
					</p>
				</div>
				<div class="home-day-grid grid items-start gap-5 pb-10 pt-4 sm:gap-8 md:pb-14 md:pt-7 lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)] lg:gap-10">
					<HomeDayLead
						page={page}
						facts={props.facts}
						t={t}
						href={href}
						format={props.format}
						copy={copy}
						unread={status().unread}
						completedCount={status().progress.completedCount}
						onStart={markStart}
					/>
					<HomeLineup
						page={page}
						t={t}
						href={href}
						games={status().renderedGames}
						onStart={markStart}
					/>
				</div>
			</div>
		</section>
	)
}
