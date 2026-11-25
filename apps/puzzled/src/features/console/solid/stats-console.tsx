/** @jsxImportSource solid-js */

import {
	ArrowRight,
	BarChart3,
	Check,
	Crown,
	Flame,
	Play,
	RefreshCw,
	Snowflake,
	Trophy,
} from 'lucide-solid'
import { For } from 'solid-js'
import { gamePath } from '@/lib/game-slug'
import { localizedPath } from '@/lib/seo/urls'
import { GameIcon } from '@/shared/solid/game-icon'
import { ConsoleCard, ConsoleHeader, ConsoleStat, HonestNotice } from './console-chrome'
import { FinishCalendarCard } from './finish-calendar'
import { MilestoneRingsCard } from './milestone-rings'
import type { StatsPageData } from './stats-data'
import { FinishHistoryCard, ModuleBreakdownCard } from './stats-tables'
import { statsTranslator } from './stats-text'

export function StatsConsole({ data }: { data: StatsPageData }) {
	const {
		locale,
		memberSession,
		memberLabel,
		modules,
		moduleRows,
		totalFinished,
		totalWon,
		winRate,
		statsKnown,
		historyKnown,
		streakKnown,
		streak: streakRead,
		completedSlugs,
		calendar,
		history,
		milestones,
		everythingUnreadable,
		nothingRecorded,
		offerPrices,
	} = data
	const t = statsTranslator(locale)
	const link = (path: string) => localizedPath(locale, path)
	const moduleNames = Object.fromEntries(modules.map((module) => [module.slug, module.name]))
	const streakChip = streakKnown && (streakRead?.currentStreak ?? 0) > 0
	const statsPriceLine =
		offerPrices?.passPrice && offerPrices?.yearlyPrice
			? t.full('plus.offer.resultPriceWithPass', {
					days: offerPrices.passDays ?? 3,
					passPrice: offerPrices?.passPrice,
					plan: t.full('plus.name'),
					price: offerPrices?.yearlyPrice,
				})
			: offerPrices?.passPrice
				? t.full('plus.offer.resultPassPrice', {
						days: offerPrices.passDays ?? 3,
						passPrice: offerPrices?.passPrice,
					})
				: offerPrices?.yearlyPrice
					? t.full('plus.offer.resultPrice', {
							plan: t.full('plus.name'),
							price: offerPrices?.yearlyPrice,
						})
					: null

	return (
		<main id="main-content" tabIndex={-1} class="page-shell-wide py-8 md:py-10">
			<div class="space-y-6">
				<ConsoleHeader
					eyebrow={t('eyebrow')}
					title={t('title')}
					description={
						memberSession ? t('descriptionMember', { name: memberLabel }) : t('descriptionGuest')
					}
					chips={
						<>
							{memberSession ? (
								<span class="chip bg-primary/10 text-primary">{t('identity.member')}</span>
							) : (
								<span class="chip bg-accent-warm/10 text-accent-warm-foreground">
									{t('identity.guest')}
								</span>
							)}
							{streakChip ? (
								<span class="chip bg-accent-warm/10 text-accent-warm">
									{t('identity.streakChip', { days: streakRead?.currentStreak ?? 0 })}
								</span>
							) : null}
							{!memberSession ? (
								<a
									href={link(`/sign-in?${new URLSearchParams({ callbackUrl: link('/stats') })}`)}
									class="chip bg-muted text-foreground underline-offset-2 hover:underline"
								>
									{t('identity.signInCta')}
								</a>
							) : null}
						</>
					}
				/>

				{everythingUnreadable ? (
					<HonestNotice
						icon={BarChart3}
						title={t('unavailableTitle')}
						body={t('unavailableDescription')}
						footnote={t('unavailableFootnote')}
						action={{ href: link('/stats'), label: t('retry') }}
					/>
				) : null}

				{!everythingUnreadable && nothingRecorded ? (
					<HonestNotice
						tone="quiet"
						icon={Play}
						title={t('noStatsYet')}
						body={t('playFirstGame')}
						action={{ href: link('/games'), label: t('startPlaying') }}
					/>
				) : null}

				{!everythingUnreadable ? (
					<>
						<div class="grid grid-cols-2 gap-3 lg:grid-cols-4">
							<ConsoleStat
								icon={Check}
								label={t('played')}
								value={statsKnown ? String(totalFinished) : t('unknownValue')}
								srValue={statsKnown ? undefined : t('unknownSr')}
								hint={
									statsKnown
										? totalFinished > 0
											? t('playedHint', { modules: moduleRows.length, puzzles: moduleRows.length })
											: t('playedHintEmpty')
										: undefined
								}
							/>
							<ConsoleStat
								icon={BarChart3}
								label={t('winRate')}
								tone="win"
								value={
									statsKnown
										? winRate === null
											? t('unknownValue')
											: `${winRate}%`
										: t('unknownValue')
								}
								srValue={
									statsKnown ? (winRate === null ? t('winRateEmptySr') : undefined) : t('unknownSr')
								}
								hint={
									statsKnown
										? winRate === null
											? t('winRateHintEmpty')
											: t('winRateHint', { won: totalWon, played: totalFinished })
										: undefined
								}
							/>
							<ConsoleStat
								icon={Flame}
								label={t('streak')}
								tone="streak"
								value={streakKnown ? String(streakRead?.currentStreak ?? 0) : t('unknownValue')}
								srValue={streakKnown ? undefined : t('unknownSr')}
								hint={
									streakKnown
										? streakRead?.hasPlayedToday
											? t('streakHintPlayed')
											: t('streakHintOpen')
										: undefined
								}
							/>
							<ConsoleStat
								icon={Trophy}
								label={t('best')}
								tone="best"
								value={streakKnown ? String(streakRead?.maxStreak ?? 0) : t('unknownValue')}
								srValue={streakKnown ? undefined : t('unknownSr')}
								hint={streakKnown ? t('bestHint', { days: streakRead?.maxStreak ?? 0 }) : undefined}
							/>
						</div>

						<ConsoleCard
							title={t('today.title')}
							description={t('today.description')}
							actions={
								<a
									href={link('/')}
									class="inline-flex min-h-11 items-center gap-1.5 rounded-full px-3 text-sm font-semibold underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
								>
									{t('today.playCta')}
								</a>
							}
						>
							{completedSlugs !== null ? (
								<ul class="divide-y divide-border overflow-hidden rounded-xl border border-border sm:grid sm:grid-cols-2 sm:divide-y-0 sm:gap-px sm:bg-border">
									<For each={modules}>
										{(module) => {
											const done = completedSlugs?.includes(module.slug)
											return (
												<li>
													<a
														href={link(gamePath(module.slug))}
														class="flex min-h-12 items-center gap-3 bg-card px-3.5 text-[15px] transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
													>
														<GameIcon slug={module.slug} size={20} aria-hidden="true" />
														<span class="min-w-0 flex-1 truncate">{module.name}</span>
														{done ? (
															<span class="flex items-center gap-1 text-xs font-semibold text-success">
																<Check class="h-4 w-4" aria-hidden="true" />
																{t('today.done')}
															</span>
														) : (
															<span class="text-xs text-muted-foreground">{t('today.open')}</span>
														)}
													</a>
												</li>
											)
										}}
									</For>
								</ul>
							) : (
								<HonestNotice
									icon={RefreshCw}
									title={t('dailyStatusUnavailableTitle')}
									body={t('dailyStatusUnavailableDescription')}
									action={{ href: link('/stats'), label: t('dailyStatusRetry') }}
								/>
							)}
						</ConsoleCard>

						<div class="grid gap-4 lg:grid-cols-2">
							<ConsoleCard title={t('streakCard.title')} description={t('streakCard.description')}>
								{streakKnown ? (
									<>
										<dl class="grid grid-cols-2 gap-4">
											<div>
												<dt class="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
													{t('streak')}
												</dt>
												<dd class="mt-1 font-display text-3xl tnum numeral">
													{streakRead?.currentStreak ?? 0}
												</dd>
											</div>
											<div>
												<dt class="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
													{t('best')}
												</dt>
												<dd class="mt-1 font-display text-3xl tnum numeral">
													{streakRead?.maxStreak ?? 0}
												</dd>
											</div>
										</dl>
										<ul class="mt-4 space-y-2 text-sm">
											<li class="flex items-center gap-2">
												<Flame class="h-4 w-4 text-accent-warm" aria-hidden="true" />
												{streakRead?.hasPlayedToday
													? t('streakCard.playedToday')
													: t('streakCard.notPlayedToday')}
											</li>
											<li class="flex items-center gap-2">
												<Snowflake class="h-4 w-4 text-primary" aria-hidden="true" />
												{t('streakCard.freezes', { count: streakRead?.freezesAvailable ?? 0 })}
											</li>
											{streakRead?.freezeUsedYesterday ? (
												<li class="flex items-center gap-2">
													<Snowflake class="h-4 w-4 text-primary" aria-hidden="true" />
													{t('streakCard.freezeUsedYesterday')}
												</li>
											) : null}
											{streakRead &&
											streakRead.currentStreak > 0 &&
											streakRead.freezesAvailable < 2 ? (
												<li class="flex items-center gap-2 text-muted-foreground">
													<Snowflake class="h-4 w-4" aria-hidden="true" />
													{t('streakCard.nextFreeze', { count: streakRead.daysUntilNextFreeze })}
												</li>
											) : null}
										</ul>
										{(streakRead?.freezesAvailable ?? 0) > 0 &&
										streakRead?.autoFreezeEnabled !== undefined ? (
											<p class="mt-3 text-xs leading-relaxed text-muted-foreground">
												{streakRead.autoFreezeEnabled
													? t('streakCard.autoFreezeOn')
													: t('streakCard.autoFreezeOff')}
											</p>
										) : null}
									</>
								) : (
									<HonestNotice
										title={t('streakCard.unavailableTitle')}
										body={t('streakCard.unavailableBody')}
										action={{ href: link('/stats'), label: t.full('common.retry') }}
									/>
								)}
							</ConsoleCard>

							{historyKnown ? (
								<FinishCalendarCard calendar={calendar} locale={locale} />
							) : (
								<ConsoleCard title={t('calendar.title')} description={t('calendar.description')}>
									<HonestNotice
										title={t('calendar.unavailableTitle')}
										body={t('calendar.unavailableBody')}
										action={{ href: link('/stats'), label: t.full('common.retry') }}
									/>
								</ConsoleCard>
							)}
						</div>

						{statsKnown ? (
							<ModuleBreakdownCard locale={locale} rows={moduleRows} />
						) : (
							<ConsoleCard title={t('modules.title')} description={t('modules.description')}>
								<HonestNotice
									title={t('modules.unavailableTitle')}
									body={t('modules.unavailableBody')}
									action={{ href: link('/stats'), label: t.full('common.retry') }}
								/>
							</ConsoleCard>
						)}

						<MilestoneRingsCard
							locale={locale}
							milestones={milestones ?? []}
							unavailable={milestones === null}
						/>

						{offerPrices !== null ? (
							<section
								aria-labelledby="stats-plus-card-title"
								data-stats-plus-card=""
								class="rounded-2xl border border-border bg-card/80 p-4 sm:p-5"
							>
								<div class="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
									<div class="min-w-0">
										<h2
											id="stats-plus-card-title"
											class="flex items-center gap-2 font-display text-base sm:text-lg"
										>
											<Crown class="h-4 w-4 shrink-0 text-accent-warm" aria-hidden="true" />
											{t('plusCard.title', { count: modules.length })}
										</h2>
										<p class="mt-1 text-sm text-muted-foreground">
											{t('plusCard.body', { count: modules.length })}
										</p>
										{statsPriceLine ? (
											<p class="mt-1 text-xs font-semibold text-foreground/85 tnum">
												{statsPriceLine}
											</p>
										) : null}
									</div>
									<a
										href={link(
											'/pricing?utm_source=tryit&utm_medium=stats_banner&entry_surface=stats_banner',
										)}
										class="inline-flex min-h-11 shrink-0 items-center justify-center gap-1.5 rounded-xl border border-border bg-background px-4 text-sm font-semibold transition-colors hover:border-primary/40 hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
									>
										{t('plusCard.cta')}
										<ArrowRight class="h-4 w-4" aria-hidden="true" />
									</a>
								</div>
							</section>
						) : null}

						{historyKnown ? (
							<FinishHistoryCard sessions={history} moduleNames={moduleNames} locale={locale} />
						) : null}
					</>
				) : null}
			</div>
		</main>
	)
}
