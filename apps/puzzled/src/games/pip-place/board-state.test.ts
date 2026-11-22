import { expect, test } from 'bun:test'
import { createInitialState, type PipPlaceAction, pipPlaceReducer } from './board-state'
import { FIXTURE_2X3_PUZZLE, FIXTURE_2X3_TILES_B } from './fixtures'

const puzzle = FIXTURE_2X3_PUZZLE

function setup() {
	let state = createInitialState(puzzle)
	return {
		state: () => state,
		dispatch(action: PipPlaceAction) {
			state = pipPlaceReducer(state, action, puzzle)
		},
		touch(row: number, col: number) {
			state = pipPlaceReducer(state, { type: 'TOUCH_CELL', cell: { row, col } }, puzzle)
		},
	}
}

test('rotate, non-adjacent selection, pick-up, undo and reset', () => {
	const { state, dispatch, touch } = setup()
	dispatch({ type: 'SELECT_TRAY', index: 1 })
	dispatch({ type: 'ROTATE' })
	touch(0, 0)
	touch(1, 1)
	expect(state().placed).toHaveLength(0)
	expect(state().pending).toEqual({ row: 1, col: 1 })
	touch(1, 2)
	expect(state().placed[0]).toMatchObject({ pa: 1, pb: 0 })
	touch(1, 2)
	expect(state().placed).toHaveLength(0)
	expect(state().tray[state().selectedTrayIndex ?? -1]).toEqual({ pa: 1, pb: 0 })
	dispatch({ type: 'UNDO' })
	expect(state().placed).toHaveLength(1)
	dispatch({ type: 'RESET' })
	expect(state()).toEqual(createInitialState(puzzle))
})

test('the alternate public-rule tiling produces the exact wire tiles without a stored solution', () => {
	const { state, dispatch, touch } = setup()
	for (const tile of FIXTURE_2X3_TILES_B) {
		dispatch({
			type: 'SELECT_TRAY',
			index: state().tray.findIndex(({ pa, pb }) => tile.pa === pa && tile.pb === pb),
		})
		touch(tile.a.row, tile.a.col)
		touch(tile.b.row, tile.b.col)
	}
	expect(state().tray).toHaveLength(0)
	expect(state().placed).toEqual(FIXTURE_2X3_TILES_B)
	expect(state().gameStatus).toBe('won')
})
