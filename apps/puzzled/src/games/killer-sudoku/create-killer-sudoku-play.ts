import { createMemo, createSignal, onCleanup, onMount } from 'solid-js'
import type { createBoardFinish } from '@/games/shared/solid/finish'
import { isFirstMove } from './first-move'
import { createInitialState, type KillerSudokuAction, killerSudokuReducer } from './state'
import { isCageSumValid, type KillerSudokuGameState, type KillerSudokuPuzzleData } from './types'

const moves = {
	ArrowUp: [-1, 0],
	ArrowDown: [1, 0],
	ArrowLeft: [0, -1],
	ArrowRight: [0, 1],
} as const

export function createKillerSudokuPlay(
	data: KillerSudokuPuzzleData,
	finish: ReturnType<typeof createBoardFinish>,
	cue: { visible: () => boolean; dismiss: () => void },
) {
	const initial = createInitialState(data)
	const [state, setState] = finish.draft.signal('state', initial)
	const [history, setHistory] = finish.draft.signal<KillerSudokuGameState[]>('history', [])
	const [feedback, setFeedback] = createSignal<'selectBlank' | 'lockedClue' | 'notesNeedBlank'>()
	const wrongCage = createMemo(() =>
		data.cages.find((cage) => isCageSumValid(state().cells, cage) === false),
	)
	const playing = () => state().gameStatus === 'playing'
	const refs: HTMLButtonElement[][] = Array.from({ length: 9 }, () => [])
	const registerCell = (row: number, col: number, element: HTMLButtonElement) => {
		refs[row][col] = element
	}
	const canUndo = () => playing() && history().length > 0

	function dispatch(action: KillerSudokuAction) {
		if (!playing()) return
		const previous = state()
		if (action.type === 'SET_VALUE') {
			const selected = previous.selectedCell
			if (!selected) return setFeedback('selectBlank')
			const [row, col] = selected
			const cell = previous.cells[row][col]
			if (cell.isGiven) return setFeedback('lockedClue')
			if (previous.notesMode && cell.value !== null) return setFeedback('notesNeedBlank')
		}
		setFeedback(undefined)
		const next = killerSudokuReducer(previous, action, data)
		if (next.cells !== previous.cells) setHistory((stack) => [...stack, previous])
		setState(next)
		if (cue.visible() && isFirstMove(action, previous, next, data.cages)) cue.dismiss()
		if (next.gameStatus === 'won') {
			finish.finish({
				finalGrid: next.cells.map((row) => row.map((cell) => cell.value)),
				mistakes: next.mistakes,
			})
		}
	}

	function undo() {
		if (!playing()) return
		const previous = history().at(-1)
		if (!previous) return
		setHistory((stack) => stack.slice(0, -1))
		setFeedback(undefined)
		setState(previous)
	}

	function keydown(event: KeyboardEvent) {
		if (
			!playing() ||
			event.defaultPrevented ||
			event.isComposing ||
			event.altKey ||
			(event.target instanceof HTMLElement &&
				(event.target.isContentEditable ||
					event.target.closest('textarea,input,select,a,dialog,[role="dialog"]')))
		)
			return
		if (event.ctrlKey || event.metaKey) {
			if (event.key.toLowerCase() === 'z' && !event.shiftKey && canUndo()) {
				event.preventDefault()
				undo()
			}
			return
		}
		const pos = state().selectedCell
		if (pos && Object.hasOwn(moves, event.key)) {
			const [dr, dc] = moves[event.key as keyof typeof moves]
			const [row, col] = pos
			event.preventDefault()
			refs[row + dr]?.[col + dc]?.focus()
			return
		}
		if (/^[1-9]$/.test(event.key)) {
			event.preventDefault()
			dispatch({ type: 'SET_VALUE', value: Number(event.key) })
		} else if (['Delete', 'Backspace', '0'].includes(event.key) && pos) {
			event.preventDefault()
			dispatch({ type: 'CLEAR_CELL' })
		} else if (event.key.toLowerCase() === 'n') {
			event.preventDefault()
			dispatch({ type: 'TOGGLE_NOTES_MODE' })
		}
	}

	onMount(() => {
		window.addEventListener('keydown', keydown)
		onCleanup(() => window.removeEventListener('keydown', keydown))
	})

	return { initial, state, feedback, wrongCage, playing, registerCell, canUndo, dispatch, undo }
}

export type KillerSudokuPlay = ReturnType<typeof createKillerSudokuPlay>
