import { expect, test } from 'bun:test'
import { type CrosswordAction, createInitialState, crosswordReducer } from './board-state'
import { parseCrosswordClientPayload } from './parse-client'

const blocked = [null, null, null, null, null]
const puzzle = parseCrosswordClientPayload({
	grid: [['', '', null, '', ''], ['', null, null, null, null], blocked, blocked, blocked],
	clues: {
		across: [{ number: 1, row: 0, col: 0, length: 2, clue: 'First hint' }],
		down: [{ number: 1, row: 0, col: 0, length: 2, clue: 'Second hint' }],
	},
})

test('clue selection sets direction and letter entry preserves blocked cells', () => {
	let state = createInitialState(puzzle)
	function dispatch(action: CrosswordAction) {
		state = crosswordReducer(state, action, puzzle)
	}
	dispatch({ type: 'SELECT_CELL', row: 0, col: 0, direction: 'down' })
	dispatch({ type: 'INPUT_LETTER', letter: 'a' })
	expect(state.selectedCell).toEqual({ row: 1, col: 0 })
	dispatch({ type: 'INPUT_LETTER', letter: 'b' })
	dispatch({ type: 'SELECT_CELL', row: 0, col: 1, direction: 'across' })
	dispatch({ type: 'INPUT_LETTER', letter: 'c' })
	expect(state.selectedCell).toEqual({ row: 0, col: 3 })
	dispatch({ type: 'INPUT_LETTER', letter: 'd' })
	dispatch({ type: 'INPUT_LETTER', letter: 'e' })
	dispatch({ type: 'CHECK_PROGRESS', puzzleData: puzzle })
	expect(state.userGrid[0]).toEqual(['A', 'C', null, 'D', 'E'])
	expect(state.isFilled).toBe(true)
	expect(state.isComplete).toBe(false)
	dispatch({ type: 'DELETE_LETTER' })
	dispatch({ type: 'CHECK_PROGRESS', puzzleData: puzzle })
	expect(state.isFilled).toBe(false)
})

const navigationPuzzle = parseCrosswordClientPayload({
	grid: [['', '', null, null, null], ['', '', null, null, null], blocked, blocked, blocked],
	clues: {
		across: [
			{ number: 1, row: 0, col: 0, length: 2, clue: 'Top row' },
			{ number: 3, row: 1, col: 0, length: 2, clue: 'Second row' },
		],
		down: [
			{ number: 1, row: 0, col: 0, length: 2, clue: 'Left column' },
			{ number: 2, row: 0, col: 1, length: 2, clue: 'Right column' },
		],
	},
})

test('steps in listed Across-then-Down order and wraps in both directions', () => {
	let state = createInitialState(navigationPuzzle)
	const step = (delta: 1 | -1, direction: 'across' | 'down', row: number, col: number) => {
		state = crosswordReducer(state, { type: 'STEP_CLUE', delta }, navigationPuzzle)
		expect(state.direction).toBe(direction)
		expect(state.selectedCell).toEqual({ row, col })
	}

	step(-1, 'down', 0, 1)
	step(1, 'across', 0, 0)
	step(1, 'across', 1, 0)
	step(1, 'down', 0, 0)
	step(-1, 'across', 1, 0)
})

test('steps to the first empty cell in the target clue or its start when filled', () => {
	const initial = createInitialState(navigationPuzzle)
	const partial = crosswordReducer(initial, { type: 'INPUT_LETTER', letter: 'A' }, navigationPuzzle)
	const next = crosswordReducer(partial, { type: 'STEP_CLUE', delta: 1 }, navigationPuzzle)
	const down = crosswordReducer(next, { type: 'STEP_CLUE', delta: 1 }, navigationPuzzle)
	expect(down.direction).toBe('down')
	expect(down.selectedCell).toEqual({ row: 1, col: 0 })
	const filled = crosswordReducer(down, { type: 'INPUT_LETTER', letter: 'B' }, navigationPuzzle)
	const across = crosswordReducer(filled, { type: 'STEP_CLUE', delta: -1 }, navigationPuzzle)
	expect(across.direction).toBe('across')
	expect(across.selectedCell).toEqual({ row: 1, col: 1 })
	const revisit = crosswordReducer(across, { type: 'STEP_CLUE', delta: 1 }, navigationPuzzle)
	expect(revisit.direction).toBe('down')
	expect(revisit.selectedCell).toEqual({ row: 0, col: 0 })
	expect(revisit.userGrid).toBe(filled.userGrid)
})

test('across-only grids wrap through Across clues and do not toggle direction', () => {
	const acrossOnly = { ...navigationPuzzle, clues: { ...navigationPuzzle.clues, down: [] } }
	const initial = createInitialState(acrossOnly)
	const previous = crosswordReducer(initial, { type: 'STEP_CLUE', delta: -1 }, acrossOnly)
	expect(previous.selectedCell).toEqual({ row: 1, col: 0 })
	expect(previous.direction).toBe('across')
	expect(crosswordReducer(previous, { type: 'TOGGLE_DIRECTION' }, acrossOnly)).toBe(previous)
	expect(crosswordReducer(previous, { type: 'STEP_CLUE', delta: 1 }, acrossOnly)).toEqual(initial)
})

test('direction toggles at the selected crossing without changing the grid', () => {
	const initial = createInitialState(navigationPuzzle)
	const down = crosswordReducer(initial, { type: 'TOGGLE_DIRECTION' }, navigationPuzzle)
	expect(down.selectedCell).toBe(initial.selectedCell)
	expect(down.userGrid).toBe(initial.userGrid)
	expect(down.direction).toBe('down')
	expect(crosswordReducer(down, { type: 'TOGGLE_DIRECTION' }, navigationPuzzle)).toEqual(initial)
})
