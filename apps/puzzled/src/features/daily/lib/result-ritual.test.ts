import { expect, test } from 'bun:test'
import { create } from '@bufbuild/protobuf'
import { GetTodayProgressResponseSchema } from '@/gen/connect/puzzled/v1/puzzle_pb'
import { formatResultElapsed, resultRitual } from './result-ritual'

const day = '2026-11-24'
const lineup = ['sudoku', 'crowns', 'number-path', 'duo']
const response = (picks: string[], finished: string[]) =>
	create(GetTodayProgressResponseSchema, {
		dayKey: day,
		freePicks: { gameSlugs: picks },
		games: lineup.map((gameSlug) => ({ gameSlug, hasCompleted: finished.includes(gameSlug) })),
	})

test('private elapsed time keeps exact seconds and never invents a missing duration', () => {
	for (const [ms, expected] of [
		[0, '0:00'],
		[34_999, '0:34'],
		[78_001, '1:18'],
		[3_660_000, '61:00'],
	] as const) {
		expect(formatResultElapsed(ms)).toBe(expected)
	}
	for (const ms of [null, undefined, -1, Number.NaN]) expect(formatResultElapsed(ms)).toBeNull()
})

test('momentum skips finished games and distinguishes a new pick from a resume', () => {
	expect(resultRitual(response(['number-path'], ['sudoku']), day, 'number-path', lineup)).toEqual({
		completed: 1,
		next: 'crowns',
		resume: false,
	})
	expect(
		resultRitual(
			response(['number-path', 'sudoku', 'duo'], ['sudoku']),
			day,
			'number-path',
			lineup,
		),
	).toEqual({ completed: 2, next: 'duo', resume: true })
	expect(
		resultRitual(
			response(['number-path', 'sudoku', 'duo'], ['sudoku', 'duo']),
			day,
			'number-path',
			lineup,
		),
	).toMatchObject({ completed: 3, next: undefined })
})

test('not even an empty-picks recommendation is inferred from stale or missing server facts', () => {
	const progress = response([], [])
	expect(resultRitual(progress, '2026-11-25', 'number-path', lineup)).toBeNull()
	expect(resultRitual({ ...progress, freePicks: undefined }, day, 'number-path', lineup)).toBeNull()
})
