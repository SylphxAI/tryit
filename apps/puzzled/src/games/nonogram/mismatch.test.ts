import { describe, expect, test } from 'bun:test'
import { findClueMismatches, isLineMismatch } from './mismatch'
import type { CellState, NonogramPuzzleData } from './types'

describe('Nonogram clue mismatches', () => {
	test('leaves a partial line alone when its current runs can still grow', () => {
		expect(isLineMismatch(['filled', 'empty', 'empty', 'filled'], [2, 1])).toBe(false)
	})

	test('checks completed runs in clue order, even when the total fill is correct', () => {
		expect(isLineMismatch(['filled', 'marked', 'filled', 'filled'], [2, 1])).toBe(true)
		expect(isLineMismatch(['filled', 'filled', 'marked', 'filled'], [2, 1])).toBe(false)
	})

	test('detects too much fill before a line is complete', () => {
		expect(isLineMismatch(['filled', 'filled', 'empty', 'filled'], [2])).toBe(true)
	})

	test('detects a run longer than any clue entry even when the total is allowed', () => {
		expect(isLineMismatch(['filled', 'filled', 'filled', 'empty', 'empty'], [2, 2])).toBe(true)
	})

	test('accepts a zero clue until a cell is filled', () => {
		expect(isLineMismatch(['empty', 'marked'], [0])).toBe(false)
		expect(isLineMismatch(['marked', 'marked'], [0])).toBe(false)
		expect(isLineMismatch(['filled', 'empty'], [0])).toBe(true)
	})

	const data: NonogramPuzzleData = {
		width: 3,
		height: 2,
		rowClues: [[2], [1]],
		colClues: [[1], [2], [0]],
	}

	test('identifies only the conflicting axes and indices on a fully decided grid', () => {
		const grid: CellState[][] = [
			['filled', 'marked', 'filled'],
			['marked', 'filled', 'marked'],
		]
		expect(findClueMismatches(grid, data)).toEqual({ rows: [0], columns: [1, 2] })
	})

	test('clearing the offending fill restores zero conflicts', () => {
		const grid: CellState[][] = [
			['filled', 'filled', 'filled'],
			['empty', 'empty', 'empty'],
		]
		expect(findClueMismatches(grid, data)).toEqual({ rows: [0], columns: [2] })
		expect(findClueMismatches([['filled', 'filled', 'empty'], grid[1]], data)).toEqual({
			rows: [],
			columns: [],
		})
	})
})
