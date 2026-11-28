import { describe, expect, test } from 'bun:test'
import { isDeadEnd, restorePath, visitCell } from './path-moves'

const puzzle = {
	size: 3,
	clues: [
		[1, null, 3],
		[6, 5, null],
		[null, null, 9],
	],
}
const start = { row: 0, col: 0 }
const empty = { row: 0, col: 1 }
const three = { row: 0, col: 2 }
const five = { row: 1, col: 1 }
const six = { row: 1, col: 0 }

describe('Path dead ends', () => {
	test('are limited to unfinished nonempty paths', () => {
		expect(isDeadEnd(puzzle, [])).toBe(false)
		const full = [
			start,
			empty,
			three,
			{ row: 1, col: 2 },
			five,
			six,
			{ row: 2, col: 0 },
			{ row: 2, col: 1 },
			{ row: 2, col: 2 },
		]
		expect(isDeadEnd(puzzle, full)).toBe(false)
	})

	test('counts a blank or the next clue as forward progress', () => {
		expect(isDeadEnd(puzzle, [start])).toBe(false)
		expect(isDeadEnd(puzzle, [start, empty])).toBe(false)
	})

	test('does not count an out-of-bounds square, a rewind, or a future clue', () => {
		const board = { ...puzzle, clues: [[1, null, 4], ...puzzle.clues.slice(1)] }
		const path = [start, empty]
		expect(isDeadEnd(board, path)).toBe(true)
		const rewind = visitCell(board, path, start)
		expect(rewind).toEqual({ kind: 'move', path: [start] })
		expect(isDeadEnd(board, path.slice(0, -1))).toBe(false)
	})
})

describe('Path visits', () => {
	test('starts only at clue 1', () => {
		expect(visitCell(puzzle, [], empty)).toEqual({ kind: 'startAtOne' })
		expect(visitCell(puzzle, [], six)).toEqual({ kind: 'startAtOne' })
		expect(visitCell(puzzle, [], start)).toEqual({ kind: 'move', path: [start] })
	})

	test('asks for an adjacent square on distant and diagonal taps, even on clues', () => {
		expect(visitCell(puzzle, [start], { row: 2, col: 0 })).toEqual({ kind: 'nextSquare' })
		expect(visitCell(puzzle, [start], three)).toEqual({ kind: 'nextSquare' })
		expect(visitCell(puzzle, [start], five)).toEqual({ kind: 'nextSquare' })
	})

	test('reports the tapped clue and expected step for an adjacent wrong clue', () => {
		expect(visitCell(puzzle, [start], six)).toEqual({ kind: 'wrongClue', clue: 6, expected: 2 })
		const path = [start, empty]
		expect(visitCell(puzzle, path, five)).toEqual({ kind: 'wrongClue', clue: 5, expected: 3 })
		expect(path).toEqual([start, empty])
	})

	test('extends onto both an empty neighbor and a matching clue without mutating the path', () => {
		const path = [start, empty]
		expect(visitCell(puzzle, [start], empty)).toEqual({ kind: 'move', path })
		expect(visitCell(puzzle, path, three)).toEqual({ kind: 'move', path: [start, empty, three] })
		expect(
			visitCell(puzzle, [start, empty, three, { row: 1, col: 2 }, five], { row: 2, col: 1 }),
		).toEqual({
			kind: 'lockedClue',
		})
		expect(path).toEqual([start, empty])
	})

	test('keeps the current head and rewinds to a visited square even if it is not adjacent', () => {
		const path = [start, empty, three]
		expect(visitCell(puzzle, path, three)).toEqual({ kind: 'head' })
		expect(visitCell(puzzle, path, empty)).toEqual({ kind: 'move', path: [start, empty] })
		expect(visitCell(puzzle, path, start)).toEqual({ kind: 'move', path: [start] })
		expect(path).toEqual([start, empty, three])
	})

	test('rejects outside or fractional coordinates before reading clues', () => {
		expect(visitCell(puzzle, [start], { row: -1, col: 0 })).toEqual({ kind: 'outside' })
		expect(visitCell(puzzle, [start], { row: 0, col: 3 })).toEqual({ kind: 'outside' })
		expect(visitCell(puzzle, [start], { row: 0.5, col: 0 })).toEqual({ kind: 'outside' })
	})
})

test('restores the longest legal draft prefix without losing legal steps', () => {
	const path = [start, empty, three, { row: 1, col: 2 }, five]
	expect(restorePath(puzzle, path)).toEqual(path)
	// Old clients could continue from 5 without placing the fixed 6.
	const misplaced = { row: 2, col: 1 }
	const oldDraft = [...path, misplaced, { row: 2, col: 0 }]
	expect(isDeadEnd(puzzle, path)).toBe(false)
	expect(restorePath(puzzle, oldDraft)).toEqual(path)
	expect(restorePath(puzzle, [...path, empty])).toEqual(path)
})
