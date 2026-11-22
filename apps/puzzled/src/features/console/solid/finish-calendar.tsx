/** @jsxImportSource solid-js */
import { For } from 'solid-js'
import type { Locale } from '@/lib/i18n/config'
import { cn } from '@/lib/utils'
import { type CalendarDay, type FinishCalendar, parseDayKey } from '../lib/finish-activity'
import { ConsoleCard } from './console-chrome'
import { statsTranslator } from './stats-text'

type FinishCalendarCardProps = {
	calendar: FinishCalendar
	locale: Locale
}

/** Weekday row labels, Monday-first to match the calendar columns. */
const WEEKDAY_KEYS = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'] as const

function formatDay(key: string, locale: Locale): string {
	const stamp = parseDayKey(key)
	if (stamp === null) return key
	return new Intl.DateTimeFormat(locale, {
		weekday: 'short',
		timeZone: 'UTC',
		day: 'numeric',
		month: 'short',
	}).format(new Date(stamp))
}

function DayCell({ day, title }: { day: CalendarDay; title: string }) {
	if (day.future) {
		return <span class="h-3.5 w-3.5 rounded-[4px] opacity-0" aria-hidden="true" />
	}
	const won = day.wonCount > 0
	return (
		<span
			title={title}
			class={cn(
				'h-3.5 w-3.5 rounded-[4px] border',
				day.finishedCount === 0 && 'border-border bg-surface-muted',
				day.finishedCount > 0 && won && 'border-transparent bg-gradient-to-br from-muted to-muted',
				day.finishedCount > 0 && !won && 'border-primary/40 bg-primary/15',
			)}
		>
			{day.finishedCount > 0 && !won ? (
				<span class="mx-auto mt-[5px] block h-1 w-1 rounded-full bg-primary" />
			) : null}
		</span>
	)
}

/**
 * Trailing-weeks activity map for accepted daily finishes.
 *
 * The grid is decorative by construction: the same information is stated as a
 * summary sentence and listed day by day in the disclosure table, so nothing
 * depends on colour alone.
 */
export function FinishCalendarCard({ calendar, locale }: FinishCalendarCardProps) {
	const t = statsTranslator(locale)
	const finishedDays = calendar.weeks
		.flat()
		.filter((day) => day.inRange && day.finishedCount > 0)
		.sort((a, b) => (a.key < b.key ? 1 : -1))

	return (
		<ConsoleCard
			title={t('calendar.title')}
			description={t('calendar.description')}
			bodyClassName="px-4 py-4 md:px-5"
		>
			<div class="flex flex-col gap-4 sm:flex-row sm:items-start sm:gap-6">
				<div class="flex gap-2" aria-hidden="true">
					<div class="flex flex-col justify-between gap-1 pt-4 text-[10px] leading-none text-muted-foreground">
						<For each={WEEKDAY_KEYS}>{(key) => <span>{t(`calendar.weekday.${key}`)}</span>}</For>
					</div>
					<div class="flex gap-1">
						<For each={calendar.weeks}>
							{(week) => (
								<div class="flex flex-col gap-1">
									<For each={week}>
										{(day) => (
											<DayCell
												day={day}
												title={`${formatDay(day.key, locale)} — ${t('calendar.cellLabel', {
													count: day.finishedCount,
												})}`}
											/>
										)}
									</For>
								</div>
							)}
						</For>
					</div>
				</div>

				<div class="min-w-0 flex-1 space-y-3">
					<dl class="space-y-1.5 text-sm">
						<div class="flex flex-wrap items-baseline gap-x-2">
							<dt class="text-muted-foreground">{t('calendar.finishedDaysLabel')}</dt>
							<dd class="font-semibold tnum">
								{t('calendar.finishedDaysValue', {
									finished: calendar.finishedDays,
									total: calendar.daysInWindow,
								})}
							</dd>
						</div>
						<div class="flex flex-wrap items-baseline gap-x-2">
							<dt class="text-muted-foreground">{t('calendar.longestRunLabel')}</dt>
							<dd class="font-semibold tnum">
								{t('calendar.daysValue', { days: calendar.longestRunDays })}
							</dd>
						</div>
						<div class="flex flex-wrap items-baseline gap-x-2">
							<dt class="text-muted-foreground">{t('calendar.todayLabel')}</dt>
							<dd class="font-semibold">
								{calendar.today && calendar.today.finishedCount > 0
									? t('calendar.todayDone')
									: t('calendar.todayOpen')}
							</dd>
						</div>
					</dl>

					<ul class="flex flex-wrap items-center gap-x-4 gap-y-2 text-xs text-muted-foreground">
						<li class="flex items-center gap-1.5">
							<span
								class="h-3.5 w-3.5 rounded-[4px] bg-gradient-to-br from-muted to-muted"
								aria-hidden="true"
							/>
							{t('calendar.legendWon')}
						</li>
						<li class="flex items-center gap-1.5">
							<span
								class="flex h-3.5 w-3.5 items-center justify-center rounded-[4px] border border-primary/40 bg-primary/15"
								aria-hidden="true"
							>
								<span class="h-1 w-1 rounded-full bg-primary" />
							</span>
							{t('calendar.legendFinished')}
						</li>
						<li class="flex items-center gap-1.5">
							<span
								class="h-3.5 w-3.5 rounded-[4px] border border-border bg-surface-muted"
								aria-hidden="true"
							/>
							{t('calendar.legendOpen')}
						</li>
					</ul>
				</div>
			</div>

			<details class="mt-4 border-t border-border/70 pt-3">
				<summary class="flex min-h-11 cursor-pointer items-center rounded-lg text-sm font-semibold text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2">
					{t('calendar.showDays')}
				</summary>
				{finishedDays.length === 0 ? (
					<p class="mt-2 text-sm text-muted-foreground">{t('calendar.noDays')}</p>
				) : (
					<table class="mt-2 w-full border-collapse text-sm">
						<caption class="sr-only">{t('calendar.tableCaption')}</caption>
						<thead>
							<tr class="text-left text-xs uppercase tracking-wide text-muted-foreground">
								<th scope="col" class="py-2 font-semibold">
									{t('calendar.tableDay')}
								</th>
								<th scope="col" class="py-2 text-right font-semibold">
									{t('calendar.tableFinished')}
								</th>
								<th scope="col" class="py-2 text-right font-semibold">
									{t('calendar.tableWon')}
								</th>
							</tr>
						</thead>
						<tbody>
							<For each={finishedDays}>
								{(day) => (
									<tr class="border-t border-border/60">
										<th scope="row" class="py-2 text-left font-medium">
											{formatDay(day.key, locale)}
										</th>
										<td class="py-2 text-right tnum">{day.finishedCount}</td>
										<td class="py-2 text-right tnum">{day.wonCount}</td>
									</tr>
								)}
							</For>
						</tbody>
					</table>
				)}
			</details>
		</ConsoleCard>
	)
}
