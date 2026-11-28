import type { MetricDay } from '@/gen/connect/puzzled/v1/admin_pb'

export function cohortPresentation(day: MetricDay, stale: boolean, locale: string) {
	const number = new Intl.NumberFormat(locale)
	const percent = new Intl.NumberFormat(locale, { style: 'percent', maximumFractionDigits: 1 })
	const rate = (numerator: number, denominator: number) => {
		const counts = `${number.format(numerator)} / ${number.format(denominator)}`
		return denominator === 0
			? `No cohort (${counts})`
			: `${percent.format(numerator / denominator)} (${counts})`
	}
	const { cohorts, guestStartCohort } = day
	return {
		allD1: cohorts ? rate(cohorts.d1Returned, cohorts.d1Cohort) : 'Unavailable',
		guestD1: cohorts
			? rate(cohorts.d1ReturnedGuestEntry, cohorts.d1CohortGuestEntry)
			: 'Unavailable',
		guestCompletion: guestStartCohort
			? rate(guestStartCohort.completedSameDay, guestStartCohort.started)
			: 'Unavailable',
		status: [!day.complete && 'Provisional', stale && 'Stale'].filter(Boolean).join(' · '),
	}
}
