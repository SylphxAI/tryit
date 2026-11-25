import { expect, test } from 'bun:test'
import { createInitialState, type PipPlaceAction, pipPlaceReducer } from './board-state'
import { FIXTURE_2X3_PUZZLE, FIXTURE_2X3_TILES_B } from './fixtures'
import { getConflictDetails } from './types'

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
	expect(state().cue).toBe('pickAdjacent')
	expect(state().pending).toEqual({ row: 0, col: 0 })
	touch(0, 1)
	expect(state().placed[0]).toMatchObject({ pa: 1, pb: 0 })
	touch(0, 1)
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

test('touching an empty cell cues the tray without starting a move', () => {
	const { state, dispatch, touch } = setup()
	touch(0, 0)
	expect(state()).toEqual({ ...createInitialState(puzzle), cue: 'selectDomino' })
	dispatch({ type: 'SELECT_TRAY', index: 0 })
	expect(state().cue).toBeNull()
})

test('drag commits one oriented placement; invalid endpoints do not disturb tap state', () => {
	const { state, dispatch, touch } = setup()
	dispatch({ type: 'SELECT_TRAY', index: 1 })
	touch(0, 2)
	const from = { row: 1, col: 0 }
	const to = { row: 0, col: 0 }
	dispatch({ type: 'DRAG_TILE', from, to: { row: 0, col: 1 } })
	expect(state().pending).toEqual({ row: 0, col: 2 })
	expect(state().cue).toBe('pickAdjacent')
	expect(state().past).toHaveLength(0)
	dispatch({ type: 'DRAG_TILE', from, to })
	expect(state().placed).toEqual([{ a: from, b: to, pa: 0, pb: 1 }])
	expect(state().past).toHaveLength(1)
	expect(state().cue).toBeNull()
	dispatch({ type: 'SELECT_TRAY', index: 0 })
	const previous = state()
	dispatch({ type: 'DRAG_TILE', from: { row: 1, col: 1 }, to: from })
	expect(state()).toBe(previous)
})

test('a full losing placement stays playable and picking up or undoing the tile clears its conflict', () => {
	const { state, dispatch, touch } = setup()
	for (const tile of FIXTURE_2X3_TILES_B.slice(0, 2)) {
		dispatch({
			type: 'SELECT_TRAY',
			index: state().tray.findIndex(({ pa, pb }) => tile.pa === pa && tile.pb === pb),
		})
		touch(tile.a.row, tile.a.col)
		touch(tile.b.row, tile.b.col)
	}
	dispatch({ type: 'SELECT_TRAY', index: 0 })
	dispatch({ type: 'ROTATE' })
	// Put the 1 on the sum-0 cell.
	touch(0, 2)
	touch(1, 2)
	expect(state().tray).toHaveLength(0)
	expect(state().gameStatus).toBe('playing')
	expect(getConflictDetails(state().placed, puzzle).regions).toEqual([
		{ regionId: 0, kind: 'sum', target: 0, actualSum: 1, cells: [{ row: 0, col: 2 }] },
	])

	touch(0, 2)
	expect(state().tray).toHaveLength(1)
	expect(getConflictDetails(state().placed, puzzle)).toEqual({ cells: [], regions: [] })
	touch(0, 2)
	touch(1, 2)
	expect(getConflictDetails(state().placed, puzzle).regions).toHaveLength(1)
	dispatch({ type: 'UNDO' })
	expect(state().tray).toHaveLength(1)
	expect(getConflictDetails(state().placed, puzzle)).toEqual({ cells: [], regions: [] })

	// Reorient the tile and actually satisfy the rule.
	dispatch({ type: 'SELECT_TRAY', index: 0 })
	dispatch({ type: 'ROTATE' })
	touch(0, 2)
	touch(1, 2)
	expect(state().gameStatus).toBe('won')
	expect(getConflictDetails(state().placed, puzzle)).toEqual({ cells: [], regions: [] })
})
