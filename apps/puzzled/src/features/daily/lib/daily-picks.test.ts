import { expect, test } from 'bun:test'
import { create } from '@bufbuild/protobuf'
import { GetTodayProgressResponseSchema } from '@/gen/connect/puzzled/v1/puzzle_pb'
import { claimedDailyPicks, dailyPickCount, unfinishedDailyPicks } from './daily-picks'

const day = '2026-11-25'
const progress = create(GetTodayProgressResponseSchema, {
	dayKey: day,
	freePicks: { gameSlugs: ['sudoku', 'tango', 'duo', 'number-path'] },
	games: [
		{ gameSlug: 'sudoku', hasCompleted: true },
		{ gameSlug: 'duo', hasCompleted: false },
		{ gameSlug: 'crowns', hasCompleted: false },
	],
})

test('counts claimed slugs, not finishes; a resume requires known unfinished status', () => {
	const picks = claimedDailyPicks(progress, day)!
	expect(picks).toEqual(['sudoku', 'duo', 'number-path'])
	expect(dailyPickCount(picks)).toBe(3)
	expect(unfinishedDailyPicks(progress, picks)).toEqual(['duo'])
})

test('distinguishes zero claimed picks from missing or stale facts', () => {
	expect(
		claimedDailyPicks({ ...progress, freePicks: { ...progress.freePicks!, gameSlugs: [] } }, day),
	).toEqual([])
	expect(claimedDailyPicks({ ...progress, freePicks: undefined }, day)).toBeNull()
	expect(claimedDailyPicks(progress, '2026-11-26')).toBeNull()
	expect(claimedDailyPicks(null, day)).toBeNull()
})
