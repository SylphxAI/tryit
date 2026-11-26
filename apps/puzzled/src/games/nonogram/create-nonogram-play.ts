import { createEffect, createMemo, createSignal, onCleanup } from 'solid-js'
import type { createBoardFinish } from '@/games/shared/solid/finish'
import { brushCell, type Cell, createBrush, strokeCells } from './brush'
import { findClueMismatches } from './mismatch'
import { type CellState, isGridClueComplete, type NonogramPuzzleData } from './types'

export type NonogramPlay = ReturnType<typeof createNonogramPlay>

export function createNonogramPlay(
	data: NonogramPuzzleData,
	finish: ReturnType<typeof createBoardFinish>,
) {
	const { width, height } = data
	const rows = Array.from({ length: height }, (_, index) => index)
	const cols = Array.from({ length: width }, (_, index) => index)
	const emptyGrid = () => rows.map(() => cols.map((): CellState => 'empty'))
	const [grid, setGrid] = finish.draft.signal('grid', emptyGrid())
	const [history, setHistory] = finish.draft.signal<CellState[][][]>('history', [])
	const [mode, setMode] = finish.draft.signal<'filled' | 'marked'>('mode', 'filled')
	const locked = () => finish.state() !== 'playing'
	const [active, setActive] = createSignal<Cell | null>(null, {
		equals: (previous, next) => previous?.row === next?.row && previous?.col === next?.col,
	})
	createEffect(() => {
		if (locked()) setActive(null)
	})
	let stroke:
		| {
				owner: HTMLDivElement
				id: number
				brush: ReturnType<typeof createBrush>
				before: CellState[][]
				last?: Cell
		  }
		| undefined

	function finishIfComplete(next: CellState[][]) {
		if (isGridClueComplete(next, data))
			finish.finish({ finalGrid: next.map((line) => line.map((cell) => cell === 'filled')) })
	}

	function applyBrush(cells: Cell[], brush: ReturnType<typeof createBrush>) {
		const current = grid()
		let next = current
		for (const { row, col } of cells) {
			const state = brushCell(current[row][col], brush)
			if (state === current[row][col]) continue
			if (next === current) next = current.slice()
			if (next[row] === current[row]) next[row] = current[row].slice()
			next[row][col] = state
		}
		if (next !== current) setGrid(next)
	}

	function commit(before: CellState[][]) {
		const after = grid()
		if (after === before) return
		setHistory((previous) => [...previous, before])
		finishIfComplete(after)
	}

	function undo() {
		if (locked() || stroke) return
		const previous = history()
		if (!previous.length) return
		setGrid(previous[previous.length - 1])
		setHistory(previous.slice(0, -1))
	}

	function startOver() {
		if (locked()) return
		clearStroke()
		setGrid(emptyGrid())
		setHistory([])
		setDimmed({})
	}

	function cellAt(board: HTMLDivElement, target: EventTarget | null): Cell | undefined {
		const cell =
			target instanceof Element
				? target.closest<HTMLElement>('button[data-paint-row][data-paint-col]')
				: null
		if (!cell || !board.contains(cell)) return
		return { row: Number(cell.dataset.paintRow), col: Number(cell.dataset.paintCol) }
	}

	function activate(cell: Cell | null) {
		if (!locked()) setActive(cell)
	}

	function restoreFocusedCell(board: HTMLDivElement) {
		activate(cellAt(board, board.ownerDocument.activeElement) ?? null)
	}

	function extendStroke(event: PointerEvent) {
		if (locked() || stroke?.id !== event.pointerId) return
		const { owner } = stroke
		const hit = owner.ownerDocument.elementFromPoint(event.clientX, event.clientY)
		const cell = cellAt(owner, hit)
		if (cell) {
			setActive(cell)
			applyBrush(strokeCells(stroke.last ?? cell, cell), stroke.brush)
		} else if (!owner.contains(hit)) {
			// Pointer capture can delay pointerleave until the stroke ends.
			restoreFocusedCell(owner)
		}
		stroke.last = cell
	}

	function clearStroke() {
		if (!stroke) return
		const { id, owner } = stroke
		stroke = undefined
		if (owner.hasPointerCapture(id)) owner.releasePointerCapture(id)
	}

	function endStroke(event: PointerEvent, commitEndpoint = false) {
		if (stroke?.id !== event.pointerId) return
		const { before } = stroke
		if (commitEndpoint) extendStroke(event)
		clearStroke()
		if (!locked()) commit(before)
	}
	onCleanup(clearStroke)

	function beginStroke(event: PointerEvent & { currentTarget: HTMLDivElement }) {
		const alternate = event.button === 2
		if (locked() || stroke || !event.isPrimary || (!alternate && event.button !== 0)) return
		const cell = cellAt(event.currentTarget, event.target)
		if (!cell) return
		setActive(cell)
		const selected = mode()
		const ink = alternate ? (selected === 'filled' ? 'marked' : 'filled') : selected
		const brush = createBrush(grid()[cell.row][cell.col], ink, alternate)
		stroke = {
			owner: event.currentTarget,
			id: event.pointerId,
			brush,
			before: grid(),
			last: cell,
		}
		event.currentTarget.setPointerCapture(event.pointerId)
		applyBrush([cell], brush)
	}

	function blurGrid(event: FocusEvent & { currentTarget: HTMLDivElement }) {
		if (!cellAt(event.currentTarget, event.relatedTarget)) setActive(null)
	}

	function preventCellContextMenu(event: MouseEvent & { currentTarget: HTMLDivElement }) {
		if (event.target === event.currentTarget || cellAt(event.currentTarget, event.target))
			event.preventDefault()
	}

	function clickCell(event: MouseEvent, row: number, col: number) {
		if (event.detail !== 0 || locked() || stroke) return
		const before = grid()
		applyBrush([{ row, col }], createBrush(before[row][col], mode()))
		commit(before)
	}

	// A manual toggle overrides automatic clue completion for that line only.
	const [dimmed, setDimmed] = finish.draft.signal<Record<string, boolean>>('dimmed', {})
	const clueDimmed = (id: string, met: boolean) => dimmed()[id] ?? met
	const toggleClue = (id: string, met: boolean) =>
		setDimmed((prev) => ({ ...prev, [id]: !clueDimmed(id, met) }))
	const conflicts = createMemo(() => findClueMismatches(grid(), data))

	return {
		rows,
		cols,
		grid,
		mode,
		setMode,
		locked,
		active,
		activate,
		clickCell,
		beginStroke,
		extendStroke,
		endStroke,
		restoreFocusedCell,
		blurGrid,
		preventCellContextMenu,
		clueDimmed,
		toggleClue,
		conflicts,
		canUndo: () => !!history().length,
		undo,
		startOver,
	}
}
