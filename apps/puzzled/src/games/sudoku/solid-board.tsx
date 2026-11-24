/** @jsxImportSource solid-js */
import { Delete, PencilLine, Undo2 } from 'lucide-solid'
import { createEffect, createMemo, createSignal, For, onCleanup, onMount, Show } from 'solid-js'
import { BoardFinish, createBoardFinish, type DailyBoardProps } from '@/games/shared/solid/finish'
import { createTranslator } from '@/lib/i18n/translate'
import styles from './components/sudoku-craft.module.css'
import { parseSudokuClientPayload } from './parse-client'
import { createInitialState, type SudokuAction, sudokuReducer } from './state'
import { BOX_SIZE, isValidPlacement, type SudokuPuzzleClientData } from './types'

const digits = [1, 2, 3, 4, 5, 6, 7, 8, 9]
const coords = [0, 1, 2]
const moves = { ArrowUp: 'up', ArrowDown: 'down', ArrowLeft: 'left', ArrowRight: 'right' } as const

export default function SudokuBoard(props: DailyBoardProps) {
	const t = createTranslator(props.locale)
	const puzzle = createMemo(() => {
		try {
			return parseSudokuClientPayload(props.puzzle.puzzleData)
		} catch {
			return null
		}
	})
	return (
		<Show when={puzzle()} keyed fallback={<p role="alert">{t('daily.unavailableTitle')}</p>}>
			{(board) => <Board data={board} {...props} />}
		</Show>
	)
}

function Board(props: DailyBoardProps & { data: SudokuPuzzleClientData }) {
	const t = createTranslator(props.locale)
	const [state, setState] = createSignal(createInitialState(props.data))
	const finish = createBoardFinish(props, 'sudoku')
	const [cue, setCue] = createSignal<'selectBlank' | 'lockedNumber' | null>(null)
	const dispatch = (action: SudokuAction) => {
		const current = state()
		setCue(null)
		if (!current.isComplete && action.type === 'INPUT_NUMBER') {
			const selected = current.selectedCell
			if (!selected) {
				setCue('selectBlank')
				return
			}
			if (current.userGrid[selected.row][selected.col].isGiven) {
				setCue('lockedNumber')
				return
			}
		}
		setState(sudokuReducer(current, action, props.data))
	}
	const values = createMemo(() => state().userGrid.map((row) => row.map((cell) => cell.value)))
	createEffect(() => {
		if (state().isComplete)
			finish.finish(
				{ finalGrid: values() },
				{ difficulty: props.difficulty ?? props.data.difficulty },
			)
	})
	onMount(() => {
		function keydown(event: KeyboardEvent) {
			if (
				state().isComplete ||
				event.defaultPrevented ||
				(event.target instanceof HTMLElement &&
					(event.target.isContentEditable || event.target.matches('textarea,input,select')))
			)
				return
			let action: SudokuAction | undefined
			const key = event.key.toLowerCase()
			if (event.ctrlKey || event.metaKey) {
				if (key === 'z' && !event.shiftKey && !event.altKey) action = { type: 'UNDO' }
			} else if (/^[1-9]$/.test(key)) action = { type: 'INPUT_NUMBER', value: Number(key) }
			else if (key === 'delete' || key === 'backspace' || key === '0')
				action = { type: 'CLEAR_CELL' }
			else if (Object.hasOwn(moves, event.key))
				action = { type: 'MOVE', direction: moves[event.key as keyof typeof moves] }
			else if (key === 'n') action = { type: 'TOGGLE_NOTES_MODE' }
			if (action && (state().selectedCell || action.type === 'INPUT_NUMBER')) {
				event.preventDefault()
				dispatch(action)
			}
		}
		window.addEventListener('keydown', keydown)
		onCleanup(() => window.removeEventListener('keydown', keydown))
	})

	const hasConflict = (row: number, col: number) => {
		const cell = state().userGrid[row][col]
		return !cell.isGiven && cell.value !== null && !isValidPlacement(values(), row, col, cell.value)
	}
	const duplicates = createMemo(() =>
		state().userGrid.some((row, r) => row.some((_, c) => hasConflict(r, c))),
	)

	const cellAt = (row: number, col: number) => {
		const cell = () => state().userGrid[row][col]
		const selected = () => state().selectedCell
		const related = () => {
			const pos = selected()
			return (
				pos &&
				(pos.row === row ||
					pos.col === col ||
					(Math.floor(pos.row / BOX_SIZE) === Math.floor(row / BOX_SIZE) &&
						Math.floor(pos.col / BOX_SIZE) === Math.floor(col / BOX_SIZE)))
			)
		}
		const matching = () => {
			const pos = selected()
			return pos && cell().value !== null && values()[pos.row][pos.col] === cell().value
		}
		const conflict = () => hasConflict(row, col)
		return (
			<button
				type="button"
				class={styles.cell}
				onClick={() => dispatch({ type: 'SELECT_CELL', row, col })}
				aria-label={[
					t('common.cellRow', { index: row + 1 }),
					t('common.cellColumn', { index: col + 1 }),
					cell().value,
				]
					.filter(Boolean)
					.join(', ')}
				data-selected={(selected()?.row === row && selected()?.col === col) || undefined}
				data-related={related() || undefined}
				data-matching={matching() || undefined}
				data-given={cell().isGiven || undefined}
				data-filled={cell().value !== null || undefined}
				data-conflict={conflict() || undefined}
				aria-invalid={conflict() || undefined}
			>
				<Show when={cell().value}>
					<span class={styles.value}>{cell().value}</span>
				</Show>
				<Show when={cell().notes.size}>
					<span class={`grid ${styles.notes}`}>
						<For each={digits}>
							{(digit) => (
								<span class={styles.note} data-visible={cell().notes.has(digit) || undefined}>
									{digit}
								</span>
							)}
						</For>
					</span>
				</Show>
				<Show when={conflict()}>
					<span class={styles.conflictMark} aria-hidden="true">
						!
					</span>
				</Show>
			</button>
		)
	}
	return (
		<div class="play-split sudoku-layout mx-auto flex w-full max-w-[26rem] flex-col gap-3">
			<div class={`play-board ${styles.board}`}>
				{/* biome-ignore lint/a11y/useSemanticElements: a Sudoku board is a named group of game controls */}
				<div class={styles.boxes} role="group" aria-label={t('games.sudoku.name')}>
					<For each={coords.flatMap((br) => coords.map((bc) => ({ br, bc })))}>
						{({ br, bc }) => (
							<div class={styles.box}>
								{coords.flatMap((r) =>
									coords.map((c) => cellAt(br * BOX_SIZE + r, bc * BOX_SIZE + c)),
								)}
							</div>
						)}
					</For>
				</div>
			</div>
			<div class="play-tools">
				<div class={styles.pad}>
					<div class={styles.digits}>
						<For each={digits}>
							{(digit) => (
								<button
									type="button"
									class={styles.key}
									disabled={state().isComplete}
									data-notes={state().isNotesMode || undefined}
									onClick={() => dispatch({ type: 'INPUT_NUMBER', value: digit })}
								>
									{digit}
								</button>
							)}
						</For>
						<button
							type="button"
							class={`${styles.key} ${styles.erase}`}
							disabled={state().isComplete}
							aria-label={t('games.sudoku.clear')}
							onClick={() => dispatch({ type: 'CLEAR_CELL' })}
						>
							<Delete size={20} aria-hidden="true" />
						</button>
					</div>
					<div class={styles.tools}>
						<button
							type="button"
							class={`${styles.key} ${styles.tool}`}
							disabled={state().isComplete || !state().history.length}
							onClick={() => dispatch({ type: 'UNDO' })}
						>
							<Undo2 size={16} aria-hidden="true" />
							{t('games.sudoku.undo')}
						</button>
						<button
							type="button"
							class={`${styles.key} ${styles.tool}`}
							disabled={state().isComplete}
							aria-pressed={state().isNotesMode}
							onClick={() => dispatch({ type: 'TOGGLE_NOTES_MODE' })}
						>
							<PencilLine size={16} aria-hidden="true" />
							{t(state().isNotesMode ? 'games.sudoku.notesMode' : 'games.sudoku.notes')}
						</button>
						<button
							type="button"
							class={`${styles.key} ${styles.tool}`}
							disabled={state().isComplete || !state().history.length}
							onClick={() => {
								if (window.confirm(t('games.sudoku.confirmReset'))) dispatch({ type: 'RESET' })
							}}
						>
							{t('common.reset')}
						</button>
					</div>
				</div>
				<div role="status" class="text-sm font-semibold">
					<Show when={cue()}>{(message) => <p>{t(`games.sudoku.${message()}`)}</p>}</Show>
					<Show when={duplicates()}>
						<p class="text-destructive">{t('games.sudoku.messages.conflict')}</p>
					</Show>
				</div>
			</div>
			<BoardFinish finish={finish} locale={props.locale} message={t('games.sudoku.complete')} />
		</div>
	)
}
