import { describe, expect, test } from 'bun:test'
import { create } from '@bufbuild/protobuf'
import { MetricDaySchema } from '@/gen/connect/puzzled/v1/admin_pb'
import { cohortPresentation } from './admin-cohorts'

const completedDay = create(MetricDaySchema, { complete: true })
const present = (day: typeof completedDay, stale = false) => cohortPresentation(day, stale, 'en-US')

describe('cohort presentation', () => {
	test('absent cohort messages are unavailable, not zero', () => {
		expect(present(completedDay)).toEqual({
			allD1: 'Unavailable',
			guestD1: 'Unavailable',
			guestCompletion: 'Unavailable',
			status: '',
		})
	})

	test('computed empty cohorts show counts but no rate', () => {
		expect(
			present(create(MetricDaySchema, { complete: true, cohorts: {}, guestStartCohort: {} })),
		).toEqual({
			allD1: 'No cohort (0 / 0)',
			guestD1: 'No cohort (0 / 0)',
			guestCompletion: 'No cohort (0 / 0)',
			status: '',
		})
	})

	test('provisional rows distinguish a true 0% from no cohort', () => {
		const day = create(MetricDaySchema, {
			cohorts: { d1Returned: 4, d1Cohort: 20, d1CohortGuestEntry: 8 },
			guestStartCohort: { completedSameDay: 4, started: 10 },
		})
		expect(present(day)).toEqual({
			allD1: '20% (4 / 20)',
			guestD1: '0% (0 / 8)',
			guestCompletion: '40% (4 / 10)',
			status: 'Provisional',
		})
		expect(present(day, true).status).toBe('Provisional · Stale')
	})

	test('stale complete data keeps its counts and flags age', () => {
		const day = create(MetricDaySchema, {
			complete: true,
			cohorts: { d1Returned: 3, d1Cohort: 10, d1ReturnedGuestEntry: 1, d1CohortGuestEntry: 4 },
			guestStartCohort: { completedSameDay: 2, started: 4 },
		})
		expect(present(day, true)).toEqual({
			allD1: '30% (3 / 10)',
			guestD1: '25% (1 / 4)',
			guestCompletion: '50% (2 / 4)',
			status: 'Stale',
		})
	})
})
