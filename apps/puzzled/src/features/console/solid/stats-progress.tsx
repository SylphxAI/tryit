/** @jsxImportSource solid-js */

import { BarChart3, Check, Flame, RefreshCw, Trophy } from 'lucide-solid'
import { For } from 'solid-js'
import { gamePath } from '@/lib/game-slug'
import { localizedPath } from '@/lib/seo/urls'
import { GameIcon } from '@/shared/solid/game-icon'
import { ConsoleCard, ConsoleStat, HonestNotice } from './console-chrome'
import type { StatsPageData } from './stats-data'
import { statsTranslator } from './stats-text'

type StatsSummaryData = Pick<
	StatsPageData,
	| 'locale'
	| 'moduleRows'
	| 'totalFinished'
	| 'totalWon'
	| 'winRate'
	| 'statsKnown'
	| 'streakKnown'
	| 'streak'
>

export function renderStatsSummary(data: StatsSummaryData) {
	const {
		locale,
		moduleRows,
		totalFinished,
		totalWon,
		winRate,
		statsKnown,
		streakKnown,
		streak: streakRead,
	} = data
	const t = statsTranslator(locale)

	return (
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
					statsKnown ? (winRate === null ? t('unknownValue') : `${winRate}%`) : t('unknownValue')
				}
				srValue={statsKnown ? (winRate === null ? t('winRateEmptySr') : undefined) : t('unknownSr')}
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
	)
}

type TodayProgressData = Pick<StatsPageData, 'locale' | 'modules' | 'completedSlugs'>

export function renderTodayProgressCard(data: TodayProgressData) {
	const { locale, modules, completedSlugs } = data
	const t = statsTranslator(locale)
	const link = (path: string) => localizedPath(locale, path)

	return (
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
	)
}
