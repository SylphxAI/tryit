import { createMemo, createSignal, onCleanup, onMount } from 'solid-js'
import { createBoardFinish, type DailyBoardProps } from '@/games/shared/solid/finish'
import { triggerHaptic } from '@/shared/hooks/use-haptic'
import {
	type CrosswordAction,
	createInitialState,
	crosswordReducer,
	findActiveClue,
} from './board-state'
import { incorrectCells } from './check-feedback'
import {
	type CrosswordClue,
	type CrosswordDirection,
	type CrosswordPuzzleClientData,
	GRID_SIZE,
	hasDownClues,
} from './types'

export const cellToken = (row: number, col: number) => `${row},${col}`
export const cellBit = (row: number, col: number) => 1 << (row * GRID_SIZE + col)

export function createCrosswordPlay(props: DailyBoardProps & { data: CrosswordPuzzleClientData }) {
	const data = props.data
	const acrossOnly = !hasDownClues(data.clues)
	const total = data.grid.flat().filter((cell) => cell !== null).length
	const [feedback, setFeedback] = createSignal<'incomplete' | 'incorrect'>()
	const [wrongCells, setWrongCells] = createSignal(0)
	const finish = createBoardFinish(props, 'crossword', {
		onRejected(error) {
			setWrongCells(incorrectCells(error))
			setFeedback('incorrect')
		},
	})
	const [state, setState] = finish.draft.signal('state', createInitialState(data))
	const playing = () => finish.state() === 'playing'
	const filled = createMemo(() => state().userGrid.flat().filter(Boolean).length)
	const cells: Record<string, HTMLButtonElement> = {}

	function registerCell(row: number, col: number, node: HTMLButtonElement) {
		cells[cellToken(row, col)] = node
	}
	function selectCell(row: number, col: number) {
		dispatch({ type: 'SELECT_CELL', row, col })
	}
	function toggleDirection() {
		dispatch({ type: 'TOGGLE_DIRECTION' })
		focusCell({ preventScroll: true })
	}
	function dispatch(action: CrosswordAction) {
		if (!playing()) return
		setState((previous) => {
			const next = crosswordReducer(previous, action, data)
			if (next.userGrid === previous.userGrid) return next
			setWrongCells((mask) => {
				for (let r = 0; r < GRID_SIZE; r++) {
					for (let c = 0; c < GRID_SIZE; c++) {
						if (previous.userGrid[r][c] !== next.userGrid[r][c]) mask &= ~cellBit(r, c)
					}
				}
				return mask
			})
			if (!wrongCells()) setFeedback(undefined)
			return crosswordReducer(next, { type: 'CHECK_PROGRESS', puzzleData: data }, data)
		})
	}
	function focusCell(options?: FocusOptions) {
		const cell = state().selectedCell
		if (cell) cells[cellToken(cell.row, cell.col)]?.focus(options)
	}
	const activeClue = createMemo(() => findActiveClue(state(), data.clues))
	function selectClue(clue: CrosswordClue, direction: CrosswordDirection) {
		dispatch({ type: 'SELECT_CELL', row: clue.row, col: clue.col, direction })
		focusCell()
	}
	function stepClue(delta: 1 | -1, event: MouseEvent) {
		dispatch({ type: 'STEP_CLUE', delta })
		// Keep keyboard focus on the arrow so it can be pressed repeatedly or Tabbed past.
		if (event.detail > 0) focusCell({ preventScroll: true })
	}
	function enter(letter: string) {
		if (!playing()) return
		triggerHaptic('light')
		dispatch(letter === '⌫' ? { type: 'DELETE_LETTER' } : { type: 'INPUT_LETTER', letter })
	}
	function keydown(event: KeyboardEvent) {
		if (
			!playing() ||
			event.defaultPrevented ||
			event.ctrlKey ||
			event.altKey ||
			event.metaKey ||
			event.isComposing
		)
			return
		const target = event.target
		if (
			target instanceof HTMLElement &&
			(target.isContentEditable ||
				target.closest('input, textarea, select, [role="textbox"], dialog, [role="dialog"]'))
		)
			return
		const key = event.key
		if (key === 'Backspace' || key === 'Delete' || /^[a-z]$/i.test(key)) {
			event.preventDefault()
			enter(key.length === 1 ? key : '⌫')
			focusCell()
		} else if (
			key === 'ArrowLeft' ||
			key === 'ArrowRight' ||
			key === 'ArrowUp' ||
			key === 'ArrowDown'
		) {
			if (!(target instanceof HTMLElement && target.closest('[data-crossword-cell]'))) return
			event.preventDefault()
			const vertical = key === 'ArrowUp' || key === 'ArrowDown'
			const direction = vertical ? 'down' : 'across'
			const step = key === 'ArrowUp' || key === 'ArrowLeft' ? -1 : 1
			const selected = state().selectedCell
			if (!selected) return
			// Across-only still allows arrow navigation to a different row.
			let { row, col } = selected
			while (true) {
				if (vertical) row += step
				else col += step
				const cell = data.grid[row]?.[col]
				if (cell === undefined) return
				if (cell === null) continue
				dispatch({ type: 'SELECT_CELL', row, col, direction })
				focusCell()
				return
			}
		}
	}
	function check() {
		if (!playing()) return
		if (!state().isFilled) {
			setFeedback('incomplete')
			return
		}
		setFeedback(undefined)
		finish.finish({ finalGrid: state().userGrid })
	}

	onMount(() => {
		window.addEventListener('keydown', keydown)
		onCleanup(() => window.removeEventListener('keydown', keydown))
	})

	return {
		acrossOnly,
		total,
		filled,
		feedback,
		wrongCells,
		finish,
		state,
		playing,
		registerCell,
		selectCell,
		toggleDirection,
		activeClue,
		selectClue,
		stepClue,
		enter,
		check,
	}
}

export type CrosswordPlay = ReturnType<typeof createCrosswordPlay>
