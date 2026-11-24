import { describe, expect, test } from 'bun:test'
import { visitCell } from './path-moves'

const puzzle = {
	size: 3,
	clues: [
		[1, null, null],
		[6, null, null],
		[null, null, 9],
	],
}
const start = { row: 0, col: 0 }
const neighbor = { row: 0, col: 1 }

describe('Path visits', () => {
	test('starts only at clue 1', () => {
		expect(visitCell(puzzle, [], neighbor)).toEqual({ kind: 'startAtOne' })
		expect(visitCell(puzzle, [], start)).toEqual({ kind: 'move', path: [start] })
	})

	test('distinguishes the current head from a blocked move', () => {
		const path = [start]
		expect(visitCell(puzzle, path, start)).toEqual({ kind: 'head' })
		expect(visitCell(puzzle, path, { row: 0, col: 2 })).toEqual({ kind: 'nextSquare' })
		expect(visitCell(puzzle, path, { row: 1, col: 0 })).toEqual({ kind: 'nextSquare' })
	})

	test('extends and rewinds without mutating the input path', () => {
		const path = [start]
		expect(visitCell(puzzle, path, neighbor)).toEqual({ kind: 'move', path: [start, neighbor] })
		expect(visitCell(puzzle, [start, neighbor], start)).toEqual({ kind: 'move', path })
		expect(path).toEqual([start])
	})
})
