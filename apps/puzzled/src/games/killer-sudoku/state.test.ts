import { expect, test } from 'bun:test'
import { createInitialState, type KillerSudokuAction, killerSudokuReducer } from './state'
import { getCellConflicts, type KillerSudokuPuzzleData } from './types'

const puzzle: KillerSudokuPuzzleData = {
	grid: Array.from({ length: 9 }, () => Array(9).fill(null)),
	cages: [
		{
			cells: [
				[0, 0],
				[0, 1],
			],
			sum: 9,
		},
	],
}

test('marks both cells only once the wrong cage total is complete, and clears after correction', () => {
	let state = createInitialState(puzzle)
	const edit = (action: KillerSudokuAction) => {
		state = killerSudokuReducer(state, action, puzzle)
	}
	edit({ type: 'SELECT_CELL', row: 0, col: 0 })
	edit({ type: 'SET_VALUE', value: 3 })
	expect(getCellConflicts(state.cells, puzzle.cages, 0, 0).size).toBe(0)
	edit({ type: 'SELECT_CELL', row: 0, col: 1 })
	edit({ type: 'SET_VALUE', value: 2 })
	for (const col of [0, 1])
		expect(getCellConflicts(state.cells, puzzle.cages, 0, col)).toEqual(new Set(['cage_sum']))
	edit({ type: 'SET_VALUE', value: 6 })
	expect(getCellConflicts(state.cells, puzzle.cages, 0, 0).size).toBe(0)
})

test('Notes leaves an entered digit untouched but can toggle a note on a blank', () => {
	let state = createInitialState(puzzle)
	const edit = (action: KillerSudokuAction) => {
		state = killerSudokuReducer(state, action, puzzle)
	}
	edit({ type: 'SELECT_CELL', row: 0, col: 0 })
	edit({ type: 'SET_VALUE', value: 3 })
	edit({ type: 'TOGGLE_NOTES_MODE' })
	edit({ type: 'SET_VALUE', value: 2 })
	expect(state.cells[0][0].value).toBe(3)
	expect(state.cells[0][0].notes.size).toBe(0)
	edit({ type: 'SELECT_CELL', row: 0, col: 1 })
	edit({ type: 'SET_VALUE', value: 2 })
	expect(state.cells[0][1].notes).toEqual(new Set([2]))
	edit({ type: 'SET_VALUE', value: 2 })
	expect(state.cells[0][1].notes.size).toBe(0)
})
