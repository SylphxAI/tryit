import type {
	Cell,
	PipPlaceGameState,
	PipPlacePuzzleData,
	PipPlaceTile,
	PipPlaceTileFace,
} from './types'
import { cellsEqual, doubleSet, inBounds, isOrthogonalNeighbor, isSolved } from './types'

type Snapshot = {
	placed: PipPlaceTile[]
	tray: PipPlaceTileFace[]
}

export type InternalState = PipPlaceGameState & {
	past: Snapshot[]
	cue: 'selectDomino' | 'pickAdjacent' | null
}

export type PipPlaceAction =
	| { type: 'SELECT_TRAY'; index: number }
	| { type: 'TOUCH_CELL'; cell: Cell }
	| { type: 'DRAG_TILE'; from: Cell; to: Cell }
	| { type: 'ROTATE' }
	| { type: 'UNDO' }
	| { type: 'RESET' }

function cloneTiles(tiles: PipPlaceTile[]): PipPlaceTile[] {
	return tiles.map((tile) => ({
		a: { row: tile.a.row, col: tile.a.col },
		b: { row: tile.b.row, col: tile.b.col },
		pa: tile.pa,
		pb: tile.pb,
	}))
}

function cloneTray(tray: PipPlaceTileFace[]): PipPlaceTileFace[] {
	return tray.map((tile) => ({ pa: tile.pa, pb: tile.pb }))
}

function initialTray(maxPip: number): PipPlaceTileFace[] {
	return doubleSet(maxPip).map(([pa, pb]) => ({ pa, pb }))
}

export function createInitialState(puzzleData: PipPlacePuzzleData): InternalState {
	return {
		placed: [],
		tray: initialTray(puzzleData.maxPip),
		selectedTrayIndex: null,
		pending: null,
		gameStatus: 'playing',
		startTime: null,
		endTime: null,
		past: [],
		cue: null,
	}
}

export function occupyingTile(placed: PipPlaceTile[], cell: Cell): number {
	return placed.findIndex((tile) => cellsEqual(tile.a, cell) || cellsEqual(tile.b, cell))
}

function snapshotOf(state: InternalState): Snapshot {
	return { placed: cloneTiles(state.placed), tray: cloneTray(state.tray) }
}

function withWinCheck(
	state: InternalState,
	placed: PipPlaceTile[],
	tray: PipPlaceTileFace[],
	puzzleData: PipPlacePuzzleData,
	selectedTrayIndex: number | null,
	pending: Cell | null,
	past: Snapshot[],
): InternalState {
	const won = isSolved(placed, puzzleData)
	return {
		...state,
		placed,
		tray,
		selectedTrayIndex,
		pending,
		past,
		cue: null,
		startTime: state.startTime ?? Date.now(),
		gameStatus: won ? 'won' : 'playing',
		endTime: won ? Date.now() : state.endTime,
	}
}

function placeTile(
	state: InternalState,
	a: Cell,
	b: Cell,
	puzzleData: PipPlacePuzzleData,
): InternalState {
	if (!isOrthogonalNeighbor(a, b)) return { ...state, cue: 'pickAdjacent' }
	const index = state.selectedTrayIndex
	if (index === null) return state
	const face = state.tray[index]
	if (!face) return state
	const tray = cloneTray(state.tray)
	tray.splice(index, 1)
	return withWinCheck(state, [...state.placed, { a, b, ...face }], tray, puzzleData, null, null, [
		...state.past,
		snapshotOf(state),
	])
}

export function pipPlaceReducer(
	state: InternalState,
	action: PipPlaceAction,
	puzzleData: PipPlacePuzzleData,
): InternalState {
	switch (action.type) {
		case 'SELECT_TRAY': {
			if (state.gameStatus !== 'playing') return state
			if (action.index < 0 || action.index >= state.tray.length) return state
			if (state.selectedTrayIndex === action.index) {
				const tray = cloneTray(state.tray)
				const tile = tray[action.index]
				if (!tile) return state
				tray[action.index] = { pa: tile.pb, pb: tile.pa }
				return {
					...state,
					tray,
					pending: null,
					cue: null,
					past: [...state.past, snapshotOf(state)],
				}
			}
			return { ...state, selectedTrayIndex: action.index, pending: null, cue: null }
		}

		case 'TOUCH_CELL': {
			if (state.gameStatus !== 'playing') return state
			const { cell } = action
			if (!inBounds(cell, puzzleData.rows, puzzleData.cols)) return state

			const occupied = occupyingTile(state.placed, cell)
			if (occupied >= 0) {
				const placed = cloneTiles(state.placed)
				const [removed] = placed.splice(occupied, 1)
				if (!removed) return state
				const tray = [...cloneTray(state.tray), { pa: removed.pa, pb: removed.pb }]
				return withWinCheck(state, placed, tray, puzzleData, tray.length - 1, null, [
					...state.past,
					snapshotOf(state),
				])
			}

			if (state.selectedTrayIndex === null) return { ...state, cue: 'selectDomino' }
			if (state.pending === null) return { ...state, pending: cell, cue: null }
			if (cellsEqual(state.pending, cell)) return { ...state, pending: null, cue: null }
			return placeTile(state, state.pending, cell, puzzleData)
		}

		case 'DRAG_TILE': {
			if (state.gameStatus !== 'playing' || state.selectedTrayIndex === null) return state
			const { from, to } = action
			if (
				!inBounds(from, puzzleData.rows, puzzleData.cols) ||
				!inBounds(to, puzzleData.rows, puzzleData.cols) ||
				occupyingTile(state.placed, from) >= 0 ||
				occupyingTile(state.placed, to) >= 0 ||
				cellsEqual(from, to)
			)
				return state
			return placeTile(state, from, to, puzzleData)
		}

		case 'ROTATE': {
			if (state.gameStatus !== 'playing') return state
			if (state.selectedTrayIndex === null) return state
			const tile = state.tray[state.selectedTrayIndex]
			if (!tile) return state
			const tray = cloneTray(state.tray)
			tray[state.selectedTrayIndex] = { pa: tile.pb, pb: tile.pa }
			return { ...state, tray, cue: null, past: [...state.past, snapshotOf(state)] }
		}

		case 'UNDO': {
			if (state.gameStatus !== 'playing') return state
			if (state.past.length === 0) return createInitialState(puzzleData)
			const past = state.past.slice(0, -1)
			const prev = state.past[state.past.length - 1]
			if (!prev) return createInitialState(puzzleData)
			return {
				...state,
				placed: cloneTiles(prev.placed),
				tray: cloneTray(prev.tray),
				selectedTrayIndex: null,
				pending: null,
				past,
				cue: null,
			}
		}

		case 'RESET': {
			if (state.gameStatus !== 'playing') return state
			return createInitialState(puzzleData)
		}

		default:
			return state
	}
}
