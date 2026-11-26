import { createMemo, createSignal, onCleanup } from 'solid-js'
import { createBoardFinish, type DailyBoardProps } from '@/games/shared/solid/finish'
import type { WordSearchClientData } from './parse-client'
import { matchSelection } from './selection'
import type { Position } from './types'

type Line = { start: Position; end: Position }
const same = (a: Position, b: Position) => a.row === b.row && a.col === b.col

function lineCells({ start, end }: Line): Position[] {
	const dr = end.row - start.row
	const dc = end.col - start.col
	if (dr && dc && Math.abs(dr) !== Math.abs(dc)) return []
	return Array.from({ length: Math.max(Math.abs(dr), Math.abs(dc)) + 1 }, (_, i) => ({
		row: start.row + Math.sign(dr) * i,
		col: start.col + Math.sign(dc) * i,
	}))
}

export function createWordSearchPlay(props: DailyBoardProps, data: WordSearchClientData) {
	const { grid, words } = data
	const locked = () => finish.state() !== 'playing'
	const finish = createBoardFinish(props, 'word-search')
	const [found, setFound] = finish.draft.signal('found', new Map<string, Line>())
	const [anchor, setAnchor] = createSignal<Position>()
	const [preview, setPreview] = createSignal<Line>()
	const [invalid, setInvalid] = createSignal(false)
	const highlighted = createMemo(() => [...found().values()].flatMap(lineCells))
	const selected = createMemo(() => {
		const drag = preview()
		const start = anchor()
		return drag ? lineCells(drag) : start ? [start] : []
	})
	let pointer:
		| { id: number; owner: HTMLButtonElement; start: Position; dragged: boolean }
		| undefined
	let board: HTMLFieldSetElement | undefined

	function setBoard(element: HTMLFieldSetElement) {
		board = element
	}

	function find(line: Line) {
		if (locked()) return
		const match = matchSelection(grid, words, found(), line.start, line.end)
		setInvalid(match.kind === 'invalid')
		if (match.kind !== 'new') return
		const next = new Map(found()).set(match.word, line)
		setFound(next)
		if (next.size === words.length) finish.finish({ foundWords: [...next.keys()] })
	}

	function select(pos: Position) {
		if (locked()) return
		setInvalid(false)
		const start = anchor()
		if (start) {
			setAnchor(undefined)
			find({ start, end: pos })
		} else setAnchor(pos)
	}

	function cellAt(target: EventTarget | null): HTMLButtonElement | undefined {
		const cell =
			target instanceof Element
				? target.closest<HTMLButtonElement>('button[data-row][data-col]')
				: null
		return cell && board?.contains(cell) ? cell : undefined
	}
	function cellPosition(cell: HTMLButtonElement): Position {
		return { row: Number(cell.dataset.row), col: Number(cell.dataset.col) }
	}
	function pointerPosition(event: PointerEvent): Position | undefined {
		const cell = cellAt(document.elementFromPoint(event.clientX, event.clientY))
		return cell && cellPosition(cell)
	}
	function clearPointer() {
		const previous = pointer
		pointer = undefined
		if (previous?.owner.hasPointerCapture(previous.id))
			previous.owner.releasePointerCapture(previous.id)
		setPreview(undefined)
	}
	onCleanup(clearPointer)

	function release(event: PointerEvent, commit: boolean) {
		if (pointer?.id !== event.pointerId) return
		const { start, dragged } = pointer
		const end = commit ? pointerPosition(event) : undefined
		clearPointer()
		if (!commit || locked()) return
		if (end && !dragged && same(start, end)) {
			select(end)
			return
		}
		setAnchor(undefined)
		if (end && !same(start, end)) find({ start, end })
		else setInvalid(true)
	}

	function startPointer(event: PointerEvent) {
		if (locked() || pointer || !event.isPrimary || event.button !== 0) return
		const owner = cellAt(event.target)
		if (!owner) return
		const start = cellPosition(owner)
		pointer = { id: event.pointerId, owner, start, dragged: false }
		setInvalid(false)
		setPreview({ start, end: start })
		owner.setPointerCapture(event.pointerId)
	}

	function movePointer(event: PointerEvent) {
		if (!pointer || pointer.id !== event.pointerId) return
		const end = pointerPosition(event)
		if (!end || !same(pointer.start, end)) pointer.dragged = true
		setPreview(end ? { start: pointer.start, end } : undefined)
	}

	function clearSelection() {
		clearPointer()
		setAnchor(undefined)
		setInvalid(false)
	}

	function reset() {
		if (locked()) return
		clearPointer()
		setFound(new Map())
		setAnchor(undefined)
		setInvalid(false)
	}

	return {
		finish,
		found,
		invalid,
		locked,
		isFound: (pos: Position) => highlighted().some((cell) => same(cell, pos)),
		isSelected: (pos: Position) => selected().some((cell) => same(cell, pos)),
		setBoard,
		startPointer,
		movePointer,
		release,
		select,
		clearSelection,
		reset,
	}
}
