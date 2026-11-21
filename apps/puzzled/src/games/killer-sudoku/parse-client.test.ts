import { describe, expect, test } from 'bun:test'
import cases from '../../../../../crates/puzzled-core/tests/fixtures/generate/killer-sudoku.json'
import { parseKillerSudokuClientPayload } from './parse-client'
import { createInitialState } from './state'
import { type Cage, isSolved } from './types'

type Case = { puzzleData?: unknown; solution?: { grid: number[][] }; error?: string }
const served = (cases as Case[]).find((c) => !c.error) as Required<Omit<Case, 'error'>>

describe('parseKillerSudokuClientPayload', () => {
	test('accepts the GetDaily wire form (solution stripped)', () => {
		expect(parseKillerSudokuClientPayload(served.puzzleData)).toEqual(served.puzzleData as never)
	})

	test('accepts the legacy wrapped form and drops the solution', () => {
		const parsed = parseKillerSudokuClientPayload({
			puzzleData: served.puzzleData,
			solution: served.solution,
		})
		expect(parsed).toEqual(served.puzzleData as never)
		expect(JSON.stringify(parsed)).not.toContain('solution')
	})

	test('rejects a malformed board', () => {
		expect(() => parseKillerSudokuClientPayload({ grid: [[1]], cages: [] })).toThrow()
		expect(() => parseKillerSudokuClientPayload(undefined)).toThrow()
	})

	test('cages partition the givens and carry integer totals', () => {
		const { grid, cages } = parseKillerSudokuClientPayload(served.puzzleData)
		expect(() => parseKillerSudokuClientPayload({ grid, cages: cages.slice(1) })).toThrow('cover')
		expect(() => parseKillerSudokuClientPayload({ grid, cages: [...cages, cages[0]] })).toThrow(
			'overlapping',
		)
		expect(() =>
			parseKillerSudokuClientPayload({
				grid,
				cages: [{ ...cages[0], sum: 0.5 }, ...cages.slice(1)],
			}),
		).toThrow('invalid cage')
	})
})

describe('the finish is judged by the rules', () => {
	test('the fixture solution solves the cages; the served givens do not', () => {
		const { grid, cages } = parseKillerSudokuClientPayload(served.puzzleData)
		expect(isSolved(createInitialState({ grid: served.solution.grid, cages }).cells, cages)).toBe(
			true,
		)
		expect(isSolved(createInitialState({ grid, cages }).cells, cages)).toBe(false)
	})
})

test('a balanced cage with repeated digits across different rows, columns and boxes still fails', () => {
	const grid = served.solution.grid
	const singletonCages = grid.flatMap((row, r) =>
		row.map((sum, c): Cage => ({ cells: [[r, c]], sum })),
	)
	expect(isSolved(createInitialState({ grid, cages: singletonCages }).cells, singletonCages)).toBe(
		true,
	)
	const repeated: Cage = {
		cells: [
			[0, 0],
			[3, 5],
		],
		sum: 10,
	}
	expect(repeated.cells.map(([row, col]) => grid[row][col])).toEqual([5, 5])
	const cages = singletonCages.filter((_, index) => index !== 0 && index !== 32).concat(repeated)
	expect(isSolved(createInitialState({ grid, cages }).cells, cages)).toBe(false)
})
