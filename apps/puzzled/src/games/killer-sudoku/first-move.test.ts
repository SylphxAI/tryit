import { expect, test } from 'bun:test'
import { create } from '@bufbuild/protobuf'
import { classifyDailyResponse } from '@/features/daily/lib/daily-fallback'
import { GetDailyResponseSchema } from '@/gen/connect/puzzled/v1/puzzle_pb'
import { CAGE_SUDOKU_CUE_SEEN_KEY } from '@/lib/storage-keys'
import { digitSetCount, firstMoveCage, isFirstMove, openFirstMoveCue } from './first-move'
import { createInitialState, killerSudokuReducer } from './state'
import type { Cage } from './types'

const cage = (sum: number, ...indices: number[]): Cage => ({
	cells: indices.map((i) => [Math.floor(i / 9), i % 9]),
	sum,
})

test('rank by public size, then number of distinct sets, then top-left square', () => {
	expect([3, 17, 10, 2].map((total) => digitSetCount(2, total))).toEqual([1, 1, 4, 0])
	const cages = [cage(6, 0, 1, 2), cage(10, 9, 10), cage(17, 36, 37), cage(3, 28, 27)]
	expect(firstMoveCage(cages)).toBe(3)
	expect([...cages].reverse()[firstMoveCage([...cages].reverse())]).toBe(cages[3])
})

test('only an unfinished daily board opens the cue, once even after reload', () => {
	const flags = new Map<string, string>()
	const storage = () => ({
		getItem: (key: string) => flags.get(key) ?? null,
		setItem: flags.set.bind(flags),
	})
	const playing = (hasCompleted: boolean) =>
		classifyDailyResponse(
			create(GetDailyResponseSchema, {
				canPlay: !hasCompleted,
				hasCompleted,
				puzzleDataJson: '{}',
			}),
		).kind === 'playable'
	expect(openFirstMoveCue(playing(true), storage)).toBe(false)
	expect(flags.size).toBe(0)
	expect(openFirstMoveCue(playing(false), storage)).toBe(true)
	expect([...flags]).toEqual([[CAGE_SUDOKU_CUE_SEEN_KEY, '1']])
	expect(openFirstMoveCue(playing(false), storage)).toBe(false)
})

test('only a committed digit without visible conflicts retires the cue; reads do not alter game state', () => {
	const data = {
		grid: Array.from({ length: 9 }, () => Array<number | null>(9).fill(null)),
		cages: [cage(8, 0, 1)],
	}
	data.grid[0][1] = 5
	const selected = {
		...createInitialState(data),
		selectedCell: [0, 0] as [number, number],
		startTime: 1000,
	}
	const digit = { type: 'SET_VALUE', value: 3 } as const
	const next = killerSudokuReducer(selected, digit, data)
	const unchanged = structuredClone(next)
	expect(isFirstMove(digit, selected, next, data.cages)).toBe(true)
	expect(next).toEqual(unchanged)
	for (const [before, value] of [
		[{ ...selected, notesMode: true }, 3],
		[selected, 5],
		[selected, 4],
	] as const) {
		const action = { type: 'SET_VALUE', value } as const
		expect(isFirstMove(action, before, killerSudokuReducer(before, action, data), data.cages)).toBe(
			false,
		)
	}
})
