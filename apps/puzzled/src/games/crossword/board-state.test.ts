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
