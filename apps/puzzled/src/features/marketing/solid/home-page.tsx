/** @jsxImportSource solid-js */
import { ArrowRight, Play } from 'lucide-solid'
import {
	type Accessor,
	createMemo,
	createSignal,
	For,
	onCleanup,
	onMount,
	Show,
	Suspense,
} from 'solid-js'
import {
	addDismissed,
	DISMISSED_COOKIE,
	parseDismissed,
	serializeDismissedCookie,
} from '@/features/announcements/lib/dismissed'
import { CATALOG_CATEGORIES } from '@/features/catalog/lib/catalog'
import {
	DAILY_FREE_PICKS,
	picksLeft,
	readDailyPicks,
	subscribeDailyPicks,
} from '@/features/daily/lib/daily-picks'
import { summarizeDailyProgress } from '@/features/daily/lib/daily-progress'
import { deriveHomeExposure } from '@/features/daily/lib/home-exposure'
import { deriveHomePlayState, scopeHomePlayState } from '@/features/daily/lib/home-play-state'
import { markStartIntent } from '@/features/daily/lib/start-intent'
import { todayPlayPath, todayResultPath } from '@/features/daily/lib/today-play-path'
import { formatCountdown } from '@/features/home/lib/day-boundary'
import { homeDayCopy, lineupStatus } from '@/features/home/lib/home-day-copy'
import { getGameColors } from '@/games/theme-colors'
import { formatTrialEnd } from '@/lib/billing/plus'
import { createTranslator } from '@/lib/i18n/translate'
import { localizedPath } from '@/lib/seo/urls'
import { cn } from '@/lib/utils'
import { GameIcon } from '@/shared/solid/game-icon'
import { JsonLd } from '@/shared/solid/json-ld'
import { PageMeta } from '@/shared/solid/page-meta'
import { ProgressRing } from '@/shared/solid/progress-ring'
import { SiteShell } from '@/shared/solid/site-shell'
import type { HomeDocument, HomeFacts } from './home-data'
import { MarketingFaq } from './marketing-faq'
import { MilestonePrompt } from './milestone-prompt'

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

export function HomePage(props: { page: HomeDocument; facts: Accessor<HomeFacts | undefined> }) {
	const page = props.page
	const t = createTranslator(page.locale)
	const href = (path: string) => localizedPath(page.locale, path)
	const count = page.catalog.length
	const [now, setNow] = createSignal(page.servedAt)
	const [picks, setPicks] = createSignal(0)
	const [mounted, setMounted] = createSignal(false)
	const [dismissed, setDismissed] = createSignal<readonly string[]>([])
	onMount(() => {
		setMounted(true)
		setNow(Date.now())
		const interval = setInterval(() => setNow(Date.now()), 1000)
		const sync = () => setPicks(Math.min(DAILY_FREE_PICKS, readDailyPicks(page.dayKey).length))
		sync()
		const unsubscribe = subscribeDailyPicks(sync)
		onCleanup(() => {
			clearInterval(interval)
			unsubscribe()
		})
	})
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
	const bySlug = new Map(page.catalog.map((game) => [game.slug, game]))
	const copy = createMemo(() =>
		homeDayCopy({
			isMember: props.facts()?.member === true,
			allDone: status().progress.allCompleted,
			freeGameDone: status().renderedGames[0]?.completed === true,
			currentStreak: props.facts()?.streak?.currentStreak ?? 0,
			hasPlayedToday: props.facts()?.streak?.hasPlayedToday ?? false,
		}),
	)
	const format = new Intl.NumberFormat(page.locale)
	const pickLabel = () =>
		picks() === 0
			? t('home.picks.fresh', { count: DAILY_FREE_PICKS })
			: picksLeft(picks()) > 0
				? t('home.picks.left', { count: picksLeft(picks()) })
				: t('home.picks.none')
	const pickSlots = () => (
		<span class="flex items-center gap-1" aria-hidden="true">
			<For each={Array.from({ length: DAILY_FREE_PICKS })}>
				{(_, index) => (
					<span class="picks-slot" classList={{ 'picks-slot-used': index() < picks() }} />
				)}
			</For>
		</span>
	)
	const dismiss = (id: string) => {
		const raw = document.cookie
			.split('; ')
			.find((cookie) => cookie.startsWith(`${DISMISSED_COOKIE}=`))
			?.slice(DISMISSED_COOKIE.length + 1)
		const ids = addDismissed(parseDismissed(raw), id)
		// biome-ignore lint/suspicious/noDocumentCookie: shared dismissal state is read by the server on the next visit
		document.cookie = serializeDismissedCookie(ids, location.protocol === 'https:')
		setDismissed(ids)
	}
	const featuredCard = (cta: Accessor<'play' | 'result'>, showsNote: Accessor<boolean>) => (
		<div
			data-day-puzzle-card=""
			class="home-featured-card tactile-card grid grid-cols-[6.5rem_minmax(0,1fr)] overflow-hidden sm:block"
		>
			<div
				class={cn(
					'home-featured-art relative flex items-center justify-center border-r-[1.5px] border-[var(--tactile-line)] sm:border-b-[1.5px] sm:border-r-0',
					getGameColors(page.featured.theme).bg,
				)}
				aria-hidden="true"
			>
				<img
					src={`/motifs/${page.featured.slug}.svg`}
					alt=""
					width="160"
					height="100"
					class="home-featured-motif block h-full w-full object-contain"
				/>
				<span class="absolute left-3 top-3 hidden rounded-full bg-[#1a1712] px-2.5 py-1 text-xs font-semibold text-[#fbf9f4] sm:block">
					{t('home.lineup.freeToday')}
				</span>
				<span class="numeral absolute right-3 top-3 hidden rounded-full bg-[#fbf9f4]/80 px-2 py-0.5 text-xs font-semibold text-[#1a1712] sm:block">
					#{format.format(page.puzzleNumber)}
				</span>
			</div>
			<div class="home-featured-content p-3 sm:p-5">
				<div class="flex items-baseline justify-between gap-3">
					<p class="home-featured-title font-display text-[1.375rem] leading-tight sm:text-[1.75rem]">
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
					class="pressable home-featured-action mt-3 flex min-h-12 w-full items-center justify-center gap-2 rounded-xl border-[1.5px] border-[#1a1712] bg-cta px-4 text-[15px] font-bold text-cta-foreground shadow-[0_3px_0_0_#1a1712] transition-colors hover:bg-cta-hover sm:mt-4 sm:text-[16px]"
					href={href(
						cta() === 'result'
							? todayResultPath(page.featured.slug)
							: todayPlayPath(page.featured.slug),
					)}
					onClick={(event) => cta() === 'play' && markStart(event, page.featured.slug)}
				>
					<Play size={16} fill="currentColor" class="shrink-0" aria-hidden="true" />
					<span class="truncate">
						{cta() === 'result'
							? t('gameResult.seeResult')
							: t('home.day.playToday', { game: page.featured.name })}
					</span>
				</a>
				<Show when={showsNote()}>
					<p class="mt-2 text-center text-xs text-muted-foreground sm:mt-2.5 sm:text-[13px]">
						{t('home.day.guestNote')}
					</p>
				</Show>
			</div>
		</div>
	)
	const lead = () => (
		<div class="min-w-0 space-y-4">
			<h1 class="max-w-xl font-display text-[clamp(2.35rem,5vw,4rem)] leading-[1.02] text-balance">
				{t(`home.day.${copy().headlineKey}`, {
					game: page.featured.name,
					count,
					days: props.facts()?.streak?.currentStreak ?? 0,
				})}
			</h1>
			<p class="max-w-md text-base leading-relaxed text-muted-foreground sm:text-lg">
				{t(props.facts()?.member ? 'home.day.bodyMember' : 'home.day.bodyGuest')}
			</p>
			{featuredCard(
				() => copy().cta,
				() => copy().showsNote,
			)}
			<Show when={props.facts()?.hasIdentity && status().unread}>
				<p class="text-sm text-muted-foreground">{t('home.hero.progressUnverified')}</p>
			</Show>
			<Show when={props.facts()?.hasIdentity && !status().unread}>
				<ProgressRing
					value={status().progress.completedCount}
					max={count}
					size={72}
					title={t('home.hero.progressRingLabel', {
						done: status().progress.completedCount,
						total: count,
					})}
				/>
			</Show>
			<Show when={(props.facts()?.playerCount ?? 0) > 0}>
				<p class="text-sm text-muted-foreground">
					{t('home.hero.playersToday', { count: format.format(props.facts()?.playerCount ?? 0) })}
				</p>
			</Show>
		</div>
	)
	return (
		<SiteShell data={page.shell}>
			<PageMeta value={page.meta} />
			<main id="main-content" class="flex-1">
				<For each={page.schemas}>{(schema) => <JsonLd value={schema} />}</For>
				<Show when={props.facts()?.milestone} keyed>
					{(milestone) => (
						<MilestonePrompt
							locale={page.locale}
							count={page.catalog.length}
							milestone={milestone}
						/>
					)}
				</Show>
				<Show when={page.season}>
					{(season) => (
						<aside
							data-season={season().id}
							class={cn(
								'border-b border-foreground/10',
								getGameColors(season().accent).bg,
								getGameColors(season().accent).onField,
							)}
						>
							<p class="page-shell-wide flex justify-center gap-2 py-2 text-sm">
								<span aria-hidden="true">{season().glyph}</span>
								{t(`home.seasons.${season().id}`)}
							</p>
						</aside>
					)}
				</Show>
				<Suspense>
					<For each={props.facts()?.notices.filter((notice) => !dismissed().includes(notice.id))}>
						{(notice) => (
							<aside class="border-b border-hairline bg-accent">
								<div class="page-shell-wide flex items-center justify-between gap-4 py-2">
									<div>
										<strong>{notice.title}</strong>
										<p>{notice.body}</p>
									</div>
									<Show when={notice.dismissible}>
										<button
											type="button"
											class="min-h-11 underline"
											onClick={() => dismiss(notice.id)}
										>
											{t('common.dismiss')}
										</button>
									</Show>
								</div>
							</aside>
						)}
					</For>
					<Show when={mounted() && props.facts()?.trialEndsMs}>
						{(end) => (
							<Show when={end() > now() && end() - now() <= 3 * 86_400_000}>
								<div class="page-shell-wide pt-4 text-sm">
									{t('plus.trial.endingSoon', { date: formatTrialEnd(end(), page.locale) })}{' '}
									<a class="underline" href={href('/settings/subscription')}>
										{t('plus.pricing.manage')}
									</a>
								</div>
							</Show>
						)}
					</Show>
				</Suspense>
				<section class="day-surface relative">
					<div class="home-day-shell page-shell-wide pt-3 md:pt-5">
						<div class="home-day-masthead masthead-rule flex flex-wrap items-center justify-between gap-3 py-2 text-sm text-muted-foreground">
							<p class="day-numeral font-semibold text-foreground">
								{t('home.day.puzzleNumber', { number: page.puzzleNumber })} ·{' '}
								{t('home.lineup.subtitleShort', { count })}
							</p>
							<Suspense
								fallback={
									<p class="picks-pill">
										{pickSlots()}
										{pickLabel()}
									</p>
								}
							>
								<Show
									when={props.facts()?.unlimited}
									fallback={
										<Show
											when={picksLeft(picks()) === 0}
											fallback={
												<p data-daily-picks={picks()} class="picks-pill">
													{pickSlots()}
													{pickLabel()}
												</p>
											}
										>
											<a
												data-daily-picks={picks()}
												class="picks-pill picks-pill-link"
												href={href(
													'/pricing?utm_source=tryit&utm_medium=picks_pill&entry_surface=picks_pill',
												)}
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
								<time data-home-countdown class="numeral font-semibold text-foreground">
									{formatCountdown(page.resetAt - now())}
								</time>
							</p>
						</div>
						<div class="home-day-grid grid items-start gap-8 pb-10 pt-5 md:pb-14 md:pt-7 lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)] lg:gap-10">
							<Suspense
								fallback={
									<div class="min-w-0">
										<h1 class="font-display text-4xl">{t('home.day.guestTitle', { count })}</h1>
										{featuredCard(
											() => 'play',
											() => true,
										)}
									</div>
								}
							>
								{lead()}
							</Suspense>
							<section aria-labelledby="home-lineup-title" class="home-lineup min-w-0">
								<div class="flex flex-wrap items-end justify-between gap-x-3">
									<div>
										<h2 id="home-lineup-title" class="font-display text-2xl">
											{t('home.lineup.title')}
										</h2>
										<p class="text-sm text-muted-foreground">
											{t('home.lineup.subtitle', { count })}
										</p>
									</div>
									<a
										class="inline-flex min-h-11 items-center gap-1 font-semibold hover:underline"
										href={href('/games')}
									>
										{t('home.lineup.seeAll')}
										<ArrowRight size={16} aria-hidden="true" />
									</a>
								</div>
								<ul class="no-scrollbar flex gap-2 overflow-x-auto pb-1 md:flex-wrap">
									<For each={CATALOG_CATEGORIES}>
										{(value) => (
											<li class="shrink-0">
												<a class="category-chip" href={href(`/games?category=${value}`)}>
													{t(`catalog.category.${value}`)}
													<span class="numeral text-muted-foreground">
														{page.catalog.filter((game) => game.category === value).length}
													</span>
												</a>
											</li>
										)}
									</For>
								</ul>
								<Suspense
									fallback={
										<ul class="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-4">
											<For each={page.fallbackOrder}>
												{(slug) => (
													<li>
														<a
															class="tactile-card block p-3"
															href={href(todayPlayPath(slug))}
															onClick={(event) => markStart(event, slug)}
															data-home-game={slug}
														>
															<GameIcon slug={slug} />
															{bySlug.get(slug)?.name}
														</a>
													</li>
												)}
											</For>
										</ul>
									}
								>
									<ul class="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-4">
										<For each={status().renderedGames}>
											{(state) => {
												const game = bySlug.get(state.slug)
												if (!game) return null
												const kind = lineupStatus(state)
												return (
													<li>
														<a
															class="tactile-card flex h-full min-h-24 flex-col gap-1 p-3 hover:border-primary"
															data-home-game={game.slug}
															data-home-status={kind}
															href={href(
																kind === 'solved'
																	? todayResultPath(game.slug)
																	: todayPlayPath(game.slug),
															)}
															onClick={(event) => kind !== 'solved' && markStart(event, game.slug)}
														>
															<GameIcon slug={game.slug} />
															<strong class="text-sm leading-tight">{game.name}</strong>
															<span class="text-xs text-muted-foreground">
																{kind === 'solved'
																	? [t('gameResult.seeResult'), state.score]
																			.filter(Boolean)
																			.join(' · ')
																	: kind === 'free'
																		? t('home.lineup.freeToday')
																		: game.duration}
															</span>
														</a>
													</li>
												)
											}}
										</For>
									</ul>
								</Suspense>
							</section>
						</div>
					</div>
				</section>
				<Suspense>
					<Show
						when={props.facts()?.member}
						fallback={
							<section class="page-shell-wide grid gap-5 py-8 md:grid-cols-3">
								<For each={['daily', 'honest', 'share']}>
									{(key) => (
										<div>
											<h2 class="font-display text-xl">{t(`home.value.${key}Title`)}</h2>
											<p class="mt-1 text-muted-foreground">{t(`home.value.${key}Body`)}</p>
										</div>
									)}
								</For>
							</section>
						}
					>
						<section class="page-shell-wide py-8">
							<Show when={props.facts()?.streak}>
								{(streak) => (
									<dl class="grid grid-cols-3 gap-2">
										<For
											each={
												[
													['currentStreak', streak().currentStreak],
													['bestStreak', streak().maxStreak],
													['gamesPlayed', streak().totalGamesPlayed],
												] as const
											}
										>
											{([key, value]) => (
												<div>
													<dt>{t(`home.member.${key}`)}</dt>
													<dd class="numeral text-2xl font-semibold">{format.format(value)}</dd>
												</div>
											)}
										</For>
									</dl>
								)}
							</Show>
							<a class="inline-flex min-h-11 items-center underline" href={href('/stats')}>
								{t('home.member.viewStats')}
							</a>
						</section>
					</Show>
				</Suspense>
				<section class="border-y border-hairline bg-surface-muted">
					<div class="page-shell-wide flex flex-wrap items-center justify-between gap-3 py-8">
						<div>
							<h2 class="font-display text-2xl">
								{t('home.tomorrow.title', { game: page.tomorrow })}
							</h2>
							<p class="text-muted-foreground">{t('home.tomorrow.body')}</p>
						</div>
						<a class="inline-flex min-h-11 items-center underline" href={href('/games')}>
							{t('home.tomorrow.cta')}
						</a>
					</div>
				</section>
				<MarketingFaq
					id="home-faq"
					title={t('home.faq.title')}
					subtitle={t('home.faq.subtitle')}
					items={page.faqs}
				/>
			</main>
		</SiteShell>
	)
}
