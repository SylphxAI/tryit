import { createMemo, createSignal } from 'solid-js'
import { createBoardFinish, type DailyBoardProps } from '@/games/shared/solid/finish'
import { triggerHaptic } from '@/shared/hooks/use-haptic'
import { createInitialState, type PipPlaceAction, pipPlaceReducer } from './board-state'
import { type Cell, cellKey, getConflictDetails, type PipPlacePuzzleData } from './types'

export function createPipPlacePlay(props: DailyBoardProps & { data: PipPlacePuzzleData }) {
	const data = props.data
	const [wrong, setWrong] = createSignal(false)
	const finish = createBoardFinish(props, 'pip-place', {
		onRejected: () => {
			// A fully placed candidate is only a local rule check. The server can reject it.
			setBoard((state) => ({ ...state, gameStatus: 'playing', endTime: null }))
			setWrong(true)
		},
	})
	const [board, setBoard] = finish.draft.signal('board', createInitialState(data))
	const playing = () => finish.state() === 'playing'
	const cells = data.regionOf.flatMap((row, r) => row.map((id, col) => ({ row: r, col, id })))
	const tileButtons: Record<number, HTMLButtonElement> = {}
	const cellButtons: Record<string, HTMLButtonElement> = {}
	let drag: { id: number; from: Cell } | undefined
	let suppressClick = false

	const selectedFace = () => {
		const state = board()
		return state.selectedTrayIndex === null ? undefined : state.tray[state.selectedTrayIndex]
	}
	const placed = createMemo(() => board().placed)
	const details = createMemo(() => getConflictDetails(placed(), data))
	const invalidCells = createMemo(() => new Set(details().cells.map(cellKey)))
	const placedPips = createMemo(
		() =>
			new Map(
				placed().flatMap((tile) => [
					[cellKey(tile.a), tile.pa] as const,
					[cellKey(tile.b), tile.pb] as const,
				]),
			),
	)
	function dispatch(action: PipPlaceAction) {
		if (!playing()) return
		const previous = board()
		const next = pipPlaceReducer(previous, action, data)
		if (previous === next) return
		if (next.cue) {
			setBoard(next)
			return
		}
		setBoard(next)
		if (action.type !== 'SELECT_TRAY' || previous.tray !== next.tray) setWrong(false)
		triggerHaptic('light')
		if (next.gameStatus === 'won') finish.finish({ tiles: next.placed })
		return next
	}
	function selectTray(index: number, event: MouseEvent) {
		const next = dispatch({ type: 'SELECT_TRAY', index })
		if (next && event.detail === 0) {
			const empty = cells.find((cell) => !placedPips().has(cellKey(cell)))
			if (empty) cellButtons[cellKey(empty)]?.focus()
		}
	}
	function touchCell({ row, col }: Cell, event: MouseEvent) {
		if (event.detail !== 0 && suppressClick) {
			suppressClick = false
			return
		}
		const previous = board()
		const next = dispatch({ type: 'TOUCH_CELL', cell: { row, col } })
		if (next && next.tray.length < previous.tray.length && event.detail === 0 && playing()) {
			tileButtons[0]?.focus()
		}
	}
	function startDrag(event: PointerEvent & { currentTarget: HTMLButtonElement }, from: Cell) {
		if (!event.isPrimary || event.button !== 0) return
		suppressClick = false
		if (!playing() || !selectedFace() || placedPips().has(cellKey(from))) return
		drag = { id: event.pointerId, from }
		event.currentTarget.setPointerCapture(event.pointerId)
	}
	function endDrag(event: PointerEvent) {
		if (drag?.id !== event.pointerId) return
		const { from } = drag
		drag = undefined
		const target = document
			.elementFromPoint(event.clientX, event.clientY)
			?.closest('[data-pip-cell]')
		const key = target?.getAttribute('data-pip-cell')
		if (key === cellKey(from) && cellButtons[key] === target) return
		suppressClick = true
		if (!key || cellButtons[key] !== target) return
		const to = cells.find((cell) => cellKey(cell) === key)
		if (to) dispatch({ type: 'DRAG_TILE', from, to })
	}
	function cancelDrag(event: PointerEvent) {
		if (drag?.id === event.pointerId) drag = undefined
	}
	function move(event: KeyboardEvent, cell: Cell) {
		const offsets: Record<string, readonly [number, number]> = {
			ArrowUp: [-1, 0],
			ArrowDown: [1, 0],
			ArrowLeft: [0, -1],
			ArrowRight: [0, 1],
		}
		const offset = offsets[event.key]
		if (!offset) return
		event.preventDefault()
		cellButtons[cellKey({ row: cell.row + offset[0], col: cell.col + offset[1] })]?.focus()
	}

	function registerCell(key: string, node: HTMLButtonElement) {
		cellButtons[key] = node
	}
	function registerTile(index: number, node: HTMLButtonElement) {
		tileButtons[index] = node
	}

	return {
		board,
		finish,
		playing,
		wrong,
		cells,
		selectedFace,
		placed,
		details,
		invalidCells,
		placedPips,
		dispatch,
		selectTray,
		touchCell,
		startDrag,
		endDrag,
		cancelDrag,
		move,
		registerCell,
		registerTile,
	}
}

export type PipPlacePlay = ReturnType<typeof createPipPlacePlay>
