import { expect, test } from 'bun:test'
import { firstBlank, firstMoveSquare } from './first-move'

test('suggests an unambiguous square, without placing or revealing its digit', () => {
	const grid = Array.from({ length: 9 }, () => Array<number | null>(9).fill(null))
	grid[1] = [1, 2, 3, 4, 5, 6, 7, 8, null]
	const before = structuredClone(grid)
	expect(firstBlank(grid)).toEqual({ row: 0, col: 0 })
	expect(firstMoveSquare(grid)).toEqual({ row: 1, col: 8 })
	expect(grid).toEqual(before)
})

test('does not suggest a square when its digit requires more than direct elimination', () => {
	const grid = Array.from({ length: 9 }, () => Array<number | null>(9).fill(null))
	expect(firstMoveSquare(grid)).toBeUndefined()
})
