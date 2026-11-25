/** @jsxImportSource solid-js */
import { For, Show } from 'solid-js'
import type { GetMetricsReportResponse } from '@/gen/connect/puzzled/v1/admin_pb'
import type { Locale } from '@/lib/i18n/config'
import { Table } from './admin-tables'

export function Metrics(props: { report: GetMetricsReportResponse; locale: Locale }) {
	const percent = new Intl.NumberFormat(props.locale, {
		style: 'percent',
		maximumFractionDigits: 1,
	})
	const rate = (n: number, d: number) =>
		d ? `${percent.format(n / d)} (${n}/${d})` : '— (no cohort)'
	return (
		<section class="space-y-3" aria-label="Daily puzzle completers">
			<h2 class="text-lg font-semibold">Daily puzzle completers</h2>
			<p>Asia/Hong_Kong product days · refreshed every 15 minutes · current day provisional</p>
			<Show when={props.report.stale}>
				<p role="alert" class="admin-card p-4">
					Scheduled metrics are missing or more than 30 minutes old. Check the product-metrics
					schedule.
				</p>
			</Show>
			<p class="text-sm">
				D7 means completing again on day 7. New completers are consenting first-time completers
				after a verified share landing in the preceding seven product days. Plus and free rates
				cover signed-in viewers only; trials are not paid.
			</p>
			<Table
				title="Last 35 product days"
				headers={[
					'Product day',
					'Completers (signed in)',
					'D7 retention',
					'Weekly regulars',
					'Shares / landings / new completers',
					'Free finish errors',
					'Plus / free completion',
					'Alerts',
				]}
			>
				<For each={props.report.days}>
					{(day) => (
						<tr>
							<th scope="row" class="whitespace-nowrap">
								{day.dayKey}
								{day.complete ? '' : ' (provisional)'}
								<span class="block font-normal">Updated {day.generatedAt}</span>
							</th>
							<td>
								{day.dailyPuzzleCompleters} ({day.signedInCompleters})
							</td>
							<td>{day.complete ? rate(day.d7Returned, day.d7Cohort) : 'Not mature'}</td>
							<td>{day.weeklyRitualists}</td>
							<td>
								{day.shares} / {day.shareLandings} / {day.shareLandingCompleters}
							</td>
							<td>{rate(day.freeFinishFailed, day.freeFinishOk + day.freeFinishFailed)}</td>
							<td>
								{rate(day.paidCompleters, day.paidActive)} /{' '}
								{rate(day.freeCompleters, day.freeActive)}
							</td>
							<td>
								{day.complete ? day.alerts.join(', ') || 'None above threshold' : 'Not evaluated'}
							</td>
						</tr>
					)}
				</For>
			</Table>
		</section>
	)
}
