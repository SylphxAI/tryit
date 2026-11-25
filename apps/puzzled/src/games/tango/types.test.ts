import { expect, test } from 'bun:test'
import { getConflictDetails, getConflicts, isSolved, type TangoCell } from './types'

function board(...rows: string[]): TangoCell[][] {
	return rows.map((row) =>
		Array.from(row, (value) => ({
			value: value === 'S' ? 'sun' : value === 'M' ? 'moon' : null,
			isGiven: false,
		})),
	)
}

const indices = [0, 1, 2, 3, 4, 5]
const empty = {
	cells: [],
	consecutive: false,
	imbalance: false,
	duplicateRows: [],
	duplicateColumns: [],
}

test('the reported 6×6 board only breaks uniqueness and flags all 36 cells once', () => {
	const grid = board('SMSMSM', 'MSMSMS', 'SMSMSM', 'MSMSMS', 'MSMSMS', 'SMSMSM')
	const details = getConflictDetails(grid)
	expect(details).toMatchObject({
		consecutive: false,
		imbalance: false,
		duplicateRows: [
			[1, 3, 6],
			[2, 4, 5],
		],
		duplicateColumns: [
			[1, 3, 5],
			[2, 4, 6],
		],
	})
	const cells = getConflicts(grid)
	expect(cells).toEqual(details.cells)
	expect(cells.sort((a, b) => a.row - b.row || a.col - b.col)).toEqual(
		indices.flatMap((row) => indices.map((col) => ({ row, col }))),
	)
	expect(isSolved(grid)).toBe(false)
})

test('duplicate full lines light up on a partial board; matching unfinished lines do not', () => {
	const grid = board('SMSMSM', '......', 'SMSMSM', 'MSMSM.', 'MSMSM.', '......')
	expect(getConflictDetails(grid)).toEqual({
		...empty,
		cells: [0, 2].flatMap((row) => indices.map((col) => ({ row, col }))),
		duplicateRows: [[1, 3]],
	})
	const transposed = indices.map((col) => grid.map((row) => row[col]))
	expect(getConflictDetails(transposed)).toEqual({
		...empty,
		cells: [0, 2].flatMap((col) => indices.map((row) => ({ row, col }))),
		duplicateColumns: [[1, 3]],
	})
	grid[2][5].value = null
	expect(getConflictDetails(grid)).toEqual(empty)
})

test('a valid 6×6 board remains solved and conflict-free', () => {
	const grid = board('SSMSMM', 'SSMMSM', 'MMSSMS', 'SMSSMM', 'MSMMSS', 'MMSMSS')
	expect(getConflictDetails(grid)).toEqual(empty)
	expect(getConflicts(grid)).toEqual([])
	expect(isSolved(grid)).toBe(true)
})

test('consecutive and imbalance preserve their original conflict cells', () => {
	const consecutive = board('SSS...', '......', '......', '......', '......', '......')
	expect(getConflictDetails(consecutive)).toEqual({
		...empty,
		consecutive: true,
		cells: [0, 1, 2].map((col) => ({ row: 0, col })),
	})
	const imbalance = board('SSMSS.', '......', '......', '......', '......', '......')
	expect(getConflictDetails(imbalance)).toEqual({
		...empty,
		imbalance: true,
		cells: [0, 1, 2, 3, 4].map((col) => ({ row: 0, col })),
	})
})
