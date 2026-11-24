import { expect, test } from 'bun:test'
import { getConflicts } from './types'

const regions = [
	[0, 1, 1, 2],
	[1, 0, 1, 2],
	[1, 1, 1, 2],
	[1, 1, 1, 0],
]

function reasonsFor(row: number, col: number) {
	const grid = regions.map((line, r) => line.map((_, c) => r === row && c === col))
	return getConflicts(grid, regions, 0, 0)
}

test('provides distinct row, column, region and touching-diagonal reasons', () => {
	expect(reasonsFor(0, 1)).toEqual(new Set(['sameRow']))
	expect(reasonsFor(1, 0)).toEqual(new Set(['sameColumn']))
	expect(reasonsFor(3, 3)).toEqual(new Set(['sameRegion']))
	expect(reasonsFor(1, 1)).toEqual(new Set(['sameRegion', 'diagonalTouch']))
	expect(reasonsFor(2, 2).size).toBe(0)
	expect(reasonsFor(0, 0).size).toBe(0)
})
