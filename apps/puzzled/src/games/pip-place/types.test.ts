import { expect, test } from 'bun:test'
import {
	getConflictDetails,
	getRegionConflicts,
	type PipPlacePuzzleData,
	type PipPlaceRegionConflict,
	type PipPlaceTile,
} from './types'

const puzzle: PipPlacePuzzleData = {
	maxPip: 3,
	rows: 2,
	cols: 5,
	regionOf: [
		[0, 0, 1, 1, 4],
		[2, 2, 3, 3, 4],
	],
	regions: [
		{ id: 0, kind: 'sum', value: 2 },
		{ id: 1, kind: 'equal', value: 1 },
		{ id: 2, kind: 'equal', value: null },
		{ id: 3, kind: 'unequal', value: null },
		{ id: 4, kind: 'free', value: null },
	],
}

function vertical(col: number, pa: number, pb: number): PipPlaceTile {
	return { a: { row: 0, col }, b: { row: 1, col }, pa, pb }
}

const failing = [vertical(0, 0, 0), vertical(1, 1, 2), vertical(2, 0, 3), vertical(3, 0, 3)]

test('reports every violated region, including zero pips and a fixed equality target', () => {
	const regions: PipPlaceRegionConflict[] = [
		{
			regionId: 0,
			kind: 'sum',
			target: 2,
			actualSum: 1,
			cells: [
				{ row: 0, col: 0 },
				{ row: 0, col: 1 },
			],
		},
		{
			regionId: 1,
			kind: 'equal',
			target: 1,
			actualSum: 0,
			cells: [
				{ row: 0, col: 2 },
				{ row: 0, col: 3 },
			],
		},
		{
			regionId: 2,
			kind: 'equal',
			target: null,
			actualSum: 2,
			cells: [
				{ row: 1, col: 0 },
				{ row: 1, col: 1 },
			],
		},
		{
			regionId: 3,
			kind: 'unequal',
			target: null,
			actualSum: 6,
			cells: [
				{ row: 1, col: 2 },
				{ row: 1, col: 3 },
			],
		},
	]
	expect(getRegionConflicts([...failing, vertical(4, 1, 2)], puzzle)).toEqual(regions)
	expect(getConflictDetails(failing, puzzle)).toEqual({
		cells: regions.flatMap((region) => region.cells),
		regions,
	})
})

test('ignores incomplete regions even if the placed pips already violate the rule', () => {
	// The first pip already exceeds the sum target; the other top region has the wrong fixed value.
	expect(getConflictDetails([vertical(0, 3, 0), vertical(2, 0, 3)], puzzle)).toEqual({
		cells: [],
		regions: [],
	})
})

test('does not flag fully covered regions that satisfy their rules', () => {
	const placed = [vertical(0, 0, 2), vertical(1, 2, 2), vertical(2, 1, 0), vertical(3, 1, 3)]
	expect(getRegionConflicts(placed, puzzle)).toEqual([])
})
