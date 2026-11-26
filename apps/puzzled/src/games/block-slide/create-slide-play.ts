import { createSignal, onCleanup, onMount } from 'solid-js'
import type { createBoardFinish } from '@/games/shared/solid/finish'
import { triggerHaptic } from '@/shared/hooks/use-haptic'
import { slide, undoSlide } from './move-history'
import { type BlockSlidePuzzle, canMove, type Direction, isWin } from './types'

const shortcuts: Record<string, Direction> = {
	ArrowUp: 'up',
	w: 'up',
	ArrowDown: 'down',
	s: 'down',
	ArrowLeft: 'left',
	a: 'left',
	ArrowRight: 'right',
	d: 'right',
}

export function createSlidePlay(
	data: BlockSlidePuzzle,
	finish: ReturnType<typeof createBoardFinish>,
) {
	const { gridWidth, gridHeight, exitX, exitY } = data
	const [history, setHistory] = finish.draft.signal('history', [data.blocks])
	const blocks = () => history()[history().length - 1]
	const moves = () => history().length - 1
	const [selected, setSelected] = createSignal<string>()
	const [feedback, setFeedback] = createSignal<'blocked' | 'emptyBoard'>()
	const [outcome, setOutcome] = createSignal<'won' | 'lost'>()
	const [elapsed, setElapsed] = createSignal(0)
	const playing = () => finish.state() === 'playing' && !outcome()

	function end(status: 'won' | 'lost', moveCount: number) {
		setElapsed(finish.draft.elapsedMs())
		setOutcome(status)
		finish.finish({ moveCount }, { status, attempts: moveCount })
	}

	function move(id: string | undefined, direction: Direction) {
		if (!id || !playing()) return
		setSelected(id)
		const next = slide(history(), id, direction, gridWidth, gridHeight)
		if (!next) {
			setFeedback('blocked')
			triggerHaptic('error')
			return
		}
		setFeedback(undefined)
		setHistory(next)
		triggerHaptic('light')
		if (isWin(blocks(), exitX, exitY)) end('won', moves())
	}

	function canMoveSelected(direction: Direction) {
		const id = selected()
		return id === undefined ? undefined : canMove(blocks(), id, direction, gridWidth, gridHeight)
	}

	function select(id: string) {
		setFeedback(undefined)
		setSelected(selected() === id ? undefined : id)
	}

	function undo() {
		if (!playing()) return
		const previous = undoSlide(history())
		if (!previous) return
		setHistory(previous)
		setFeedback(undefined)
	}

	onMount(() => {
		function onKeyDown(event: KeyboardEvent) {
			if (
				!playing() ||
				!selected() ||
				event.defaultPrevented ||
				event.isComposing ||
				event.ctrlKey ||
				event.metaKey ||
				event.altKey
			)
				return
			const target = event.target
			if (
				target instanceof HTMLElement &&
				(target.isContentEditable ||
					target.closest('input, textarea, select, [role="textbox"], dialog, [role="dialog"]'))
			)
				return
			const direction = shortcuts[event.key] ?? shortcuts[event.key.toLowerCase()]
			if (!direction) return
			event.preventDefault()
			move(selected(), direction)
		}
		window.addEventListener('keydown', onKeyDown)
		onCleanup(() => window.removeEventListener('keydown', onKeyDown))
	})

	return {
		blocks,
		moves,
		selected,
		select,
		feedback,
		reportEmptyBoard: () => setFeedback('emptyBoard'),
		outcome,
		elapsed,
		playing,
		canMoveSelected,
		move,
		undo,
		giveUp: () => end('lost', moves()),
	}
}
