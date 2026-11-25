/** @jsxImportSource solid-js */
import { Play } from 'lucide-solid'
import { type Accessor, Show, Suspense } from 'solid-js'
import { todayPlayPath, todayResultPath } from '@/features/daily/lib/today-play-path'
import type { HomeDayCopy } from '@/features/home/lib/home-day-copy'
import { homeParticipationCopy } from '@/features/home/lib/home-participation-copy'
import { gameFamilyColor, getGameColors } from '@/games/theme-colors'
import type { Translate } from '@/lib/i18n/translate'
import { cn } from '@/lib/utils'
import { ProgressRing } from '@/shared/solid/progress-ring'
import type { HomeDocument, HomeFacts } from './home-data'

export function HomeDayLead(props: {
	page: HomeDocument
	facts: Accessor<HomeFacts | undefined>
	t: Translate
	href: (path: string) => string
	format: Intl.NumberFormat
	copy: Accessor<HomeDayCopy>
	unread: boolean
	completedCount: number
	onStart: (event: MouseEvent, slug: string) => void
}) {
	const { page, t, href, copy, format } = props
	const count = page.catalog.length
	const featuredCard = (cta: Accessor<'play' | 'result'>) => (
		<div
			data-day-puzzle-card=""
			class="home-featured-card editorial-surface grid grid-cols-[6.5rem_minmax(0,1fr)] overflow-hidden rounded-3xl sm:block"
			classList={{ [gameFamilyColor[page.featured.category]]: true }}
		>
			<div
				class={cn(
					'home-featured-art family-field relative flex items-center justify-center border-e border-hairline sm:border-e-0 sm:border-b',
				)}
				aria-hidden="true"
				style={{ '--game-paper': getGameColors(page.featured.theme).hex }}
			>
				<img
					src={`/motifs/${page.featured.slug}.svg`}
					alt=""
					width="160"
					height="100"
					class="home-featured-motif block h-full w-full object-contain"
				/>
				<span class="absolute left-3 top-3 hidden rounded-full bg-card px-2.5 py-1 text-xs font-semibold text-foreground sm:block">
					{t('home.lineup.freeToday')}
				</span>
				<span class="numeral absolute right-3 top-3 hidden rounded-full bg-card px-2 py-0.5 text-xs font-semibold text-muted-foreground sm:block">
					#{format.format(page.puzzleNumber)}
				</span>
			</div>
			<div class="home-featured-content p-3 sm:p-5">
				<div class="flex items-baseline justify-between gap-3">
					<p class="home-featured-title font-display text-[1.5rem] leading-tight font-extrabold sm:text-[2rem]">
						{page.featured.name}
					</p>
					<Show when={page.featured.duration}>
						<span class="numeral hidden shrink-0 text-sm text-muted-foreground sm:inline">
							{page.featured.duration}
						</span>
					</Show>
				</div>
				<p class="mt-0.5 line-clamp-1 text-[14px] text-muted-foreground sm:text-[15px]">
					{page.featured.tagline}
				</p>
				<a
					data-day-primary-action=""
					data-home-featured={page.featured.slug}
					class="chrome-control chrome-primary mt-2 flex min-h-12 w-full gap-2 px-4 text-[15px] font-bold sm:mt-4 sm:text-[16px]"
					href={href(
						cta() === 'result'
							? todayResultPath(page.featured.slug)
							: todayPlayPath(page.featured.slug),
					)}
					onClick={(event) => cta() === 'play' && props.onStart(event, page.featured.slug)}
				>
					<Play size={16} fill="currentColor" class="shrink-0" aria-hidden="true" />
					<span class="truncate">
						{cta() === 'result'
							? t('gameResult.seeResult')
							: t('home.day.playToday', { game: page.featured.name })}
					</span>
				</a>
			</div>
		</div>
	)
	const lead = () => (
		<div class="home-day-lead min-w-0 space-y-3 sm:space-y-4">
			<h1 class="editorial-title max-w-xl">
				{t(`home.day.${copy().headlineKey}`, {
					game: page.featured.name,
					count,
					days: props.facts()?.streak?.currentStreak ?? 0,
				})}
			</h1>
			{featuredCard(() => copy().cta)}
			<Show when={props.facts()?.hasIdentity && props.unread}>
				<p class="text-sm text-muted-foreground">{t('home.hero.progressUnverified')}</p>
			</Show>
			<Show when={props.facts()?.hasIdentity && !props.unread}>
				<ProgressRing
					value={props.completedCount}
					max={count}
					size={72}
					title={t('home.hero.progressRingLabel', {
						done: props.completedCount,
						total: count,
					})}
				/>
			</Show>
			<Show when={homeParticipationCopy(t, props.facts()?.playerCount)}>
				{(message) => <p class="text-sm text-muted-foreground">{message()}</p>}
			</Show>
		</div>
	)
	return (
		<Suspense
			fallback={
				<div class="home-day-lead min-w-0 space-y-3 sm:space-y-4">
					<h1 class="editorial-title max-w-xl">{t('home.day.guestTitle', { count })}</h1>
					{featuredCard(() => 'play')}
				</div>
			}
		>
			{lead()}
		</Suspense>
	)
}
