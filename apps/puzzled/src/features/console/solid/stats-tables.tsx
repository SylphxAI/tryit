/** @jsxImportSource solid-js */
import { For } from 'solid-js'
import type { Locale } from '@/lib/i18n/config'
import { localizedPath } from '@/lib/seo/urls'
import { GameIcon } from '@/shared/solid/game-icon'
import { durationParts, type FinishSession, type ModuleStatRow } from '../lib/finish-activity'
import { ConsoleCard } from './console-chrome'
import { statsTranslator } from './stats-text'

/** Per-module record for the modules this player has actually finished. */
export function ModuleBreakdownCard({
	rows,
	locale,
}: {
	rows: readonly ModuleStatRow[]
	locale: Locale
}) {
	const t = statsTranslator(locale)
	const totals = rows.reduce(
		(acc, row) => ({
			played: acc.played + row.played,
			won: acc.won + row.won,
		}),
		{ played: 0, won: 0 },
	)
	const totalRate = totals.played > 0 ? Math.round((totals.won / totals.played) * 100) : null

	if (rows.length === 0) {
		return (
			<ConsoleCard title={t('modules.title')} description={t('modules.description')}>
				<p class="text-sm text-muted-foreground">{t('modules.empty')}</p>
				<a
					href={localizedPath(locale, '/games')}
					class="mt-3 inline-flex min-h-11 items-center gap-1.5 rounded-xl border border-border bg-background px-4 text-sm font-semibold transition-colors hover:border-primary/40 hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
				>
					{t('modules.browse')}
				</a>
			</ConsoleCard>
		)
	}

	return (
		<ConsoleCard title={t('modules.title')} description={t('modules.description')}>
			<div class="-mx-4 overflow-x-auto md:-mx-5">
				<table class="w-full min-w-[32rem] border-collapse text-sm">
					<caption class="sr-only">{t('modules.tableCaption')}</caption>
					<thead>
						<tr class="text-left text-xs uppercase tracking-wide text-muted-foreground">
							<th scope="col" class="px-4 py-2 font-semibold md:px-5">
								{t('modules.module')}
							</th>
							<th scope="col" class="px-3 py-2 text-right font-semibold">
								{t('modules.finished')}
							</th>
							<th scope="col" class="px-3 py-2 text-right font-semibold">
								{t('modules.won')}
							</th>
							<th scope="col" class="px-3 py-2 text-right font-semibold">
								{t('modules.winRate')}
							</th>
							<th scope="col" class="px-4 py-2 text-right font-semibold md:px-5">
								{t('modules.bestScore')}
							</th>
						</tr>
					</thead>
					<tbody>
						<For each={rows}>
							{(row) => (
								<tr class="border-t border-border/60">
									<th scope="row" class="px-4 py-3 text-left font-medium md:px-5">
										<span class="flex items-center gap-2">
											<GameIcon slug={row.slug} size={20} aria-hidden="true" />
											<span class="truncate">{row.name}</span>
										</span>
									</th>
									<td class="px-3 py-3 text-right tnum">{row.played}</td>
									<td class="px-3 py-3 text-right tnum">{row.won}</td>
									<td class="px-3 py-3 text-right tnum">
										{row.winRate === null ? t('notRecorded') : `${row.winRate}%`}
									</td>
									<td class="px-4 py-3 text-right tnum md:px-5">
										{row.bestScore === null ? t('notRecorded') : row.bestScore}
									</td>
								</tr>
							)}
						</For>
					</tbody>
					<tfoot>
						<tr class="border-t border-border bg-surface-muted/60 font-semibold">
							<th scope="row" class="px-4 py-3 text-left md:px-5">
								{t('modules.allModules')}
							</th>
							<td class="px-3 py-3 text-right tnum">{totals.played}</td>
							<td class="px-3 py-3 text-right tnum">{totals.won}</td>
							<td class="px-3 py-3 text-right tnum">
								{totalRate === null ? t('notRecorded') : `${totalRate}%`}
							</td>
							{/* Best score is per module: a total would be a number that means nothing. */}
							<td class="px-4 py-3 text-right md:px-5" />
						</tr>
					</tfoot>
				</table>
			</div>
		</ConsoleCard>
	)
}

/** Newest accepted finishes, as the server ordered them. */
export function FinishHistoryCard({
	sessions,
	moduleNames,
	locale,
}: {
	sessions: readonly FinishSession[]
	moduleNames: Record<string, string>
	locale: Locale
}) {
	const t = statsTranslator(locale)

	if (sessions.length === 0) {
		return (
			<ConsoleCard title={t('historyTitle')} description={t('history.description')}>
				<p class="text-sm text-muted-foreground">{t('historyEmpty')}</p>
			</ConsoleCard>
		)
	}

	return (
		<ConsoleCard title={t('historyTitle')} description={t('history.description')}>
			<div class="-mx-4 overflow-x-auto md:-mx-5">
				<table class="w-full min-w-[34rem] border-collapse text-sm">
					<caption class="sr-only">{t('history.tableCaption')}</caption>
					<thead>
						<tr class="text-left text-xs uppercase tracking-wide text-muted-foreground">
							<th scope="col" class="px-4 py-2 font-semibold md:px-5">
								{t('history.day')}
							</th>
							<th scope="col" class="px-3 py-2 font-semibold">
								{t('history.module')}
							</th>
							<th scope="col" class="px-3 py-2 font-semibold">
								{t('history.result')}
							</th>
							<th scope="col" class="px-3 py-2 text-right font-semibold">
								{t('history.score')}
							</th>
							<th scope="col" class="px-4 py-2 text-right font-semibold md:px-5">
								{t('history.time')}
							</th>
						</tr>
					</thead>
					<tbody>
						<For each={sessions}>
							{(session) => {
								const parts = durationParts(session.timeSpentMs)
								return (
									<tr class="border-t border-border/60">
										<td class="px-4 py-3 md:px-5">{session.puzzleDate || t('notRecorded')}</td>
										<td class="px-3 py-3">
											<span class="flex items-center gap-2">
												<GameIcon slug={session.gameSlug} size={20} aria-hidden="true" />
												<span class="truncate">
													{moduleNames[session.gameSlug] ?? session.gameSlug}
												</span>
											</span>
										</td>
										<td class="px-3 py-3">
											{session.status === 'won' ? t('history.won') : t('history.finished')}
										</td>
										<td class="px-3 py-3 text-right tnum">{session.score}</td>
										<td class="px-4 py-3 text-right tnum md:px-5">
											{t('duration', { minutes: parts.minutes, seconds: parts.seconds })}
										</td>
									</tr>
								)
							}}
						</For>
					</tbody>
				</table>
			</div>
			<p class="mt-3 text-xs text-muted-foreground">{t('history.note')}</p>
		</ConsoleCard>
	)
}
