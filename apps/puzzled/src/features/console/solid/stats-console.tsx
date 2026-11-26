/** @jsxImportSource solid-js */

import { BarChart3, Play } from 'lucide-solid'
import { localizedPath } from '@/lib/seo/urls'
import { ConsoleCard, ConsoleHeader, HonestNotice } from './console-chrome'
import { FinishCalendarCard } from './finish-calendar'
import { MilestoneRingsCard } from './milestone-rings'
import type { StatsPageData } from './stats-data'
import { renderStatsPlusCard } from './stats-plus-card'
import { renderStatsSummary, renderTodayProgressCard } from './stats-progress'
import { renderStreakFreezeCard } from './stats-streak-card'
import { FinishHistoryCard, ModuleBreakdownCard } from './stats-tables'
import { statsTranslator } from './stats-text'

// Render the extracted sections in the console’s Solid hydration scope so generated IDs stay stable.
export function StatsConsole({ data }: { data: StatsPageData }) {
	const {
		locale,
		memberSession,
		memberLabel,
		modules,
		moduleRows,
		statsKnown,
		historyKnown,
		streakKnown,
		streak: streakRead,
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
						{renderStatsSummary(data)}

						{renderTodayProgressCard(data)}

						<div class="grid gap-4 lg:grid-cols-2">
							{renderStreakFreezeCard(data)}

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

						{offerPrices !== null ? renderStatsPlusCard(locale, modules.length, offerPrices) : null}

						{historyKnown ? (
							<FinishHistoryCard sessions={history} moduleNames={moduleNames} locale={locale} />
						) : null}
					</>
				) : null}
			</div>
		</main>
	)
}
