/** @jsxImportSource solid-js */
import { Delete, PencilLine, RotateCcw, Undo2 } from 'lucide-solid'
import { createMemo, createSignal, For, onCleanup, onMount, Show } from 'solid-js'
import { BoardFinish, createBoardFinish, type DailyBoardProps } from '@/games/shared/solid/finish'
import styles from '@/games/sudoku/components/sudoku-craft.module.css'
import { createTranslator } from '@/lib/i18n/translate'
import { parseKillerSudokuClientPayload } from './parse-client'
import cageStyles from './solid-cages.module.css'
import { createInitialState, type KillerSudokuAction, killerSudokuReducer } from './state'
import {
	getCellConflicts,
	isCageSumValid,
	type KillerSudokuGameState,
	type KillerSudokuPuzzleData,
} from './types'

const digits = [1, 2, 3, 4, 5, 6, 7, 8, 9]
const coords = [0, 1, 2]
const boxes = coords.flatMap((br) => coords.map((bc) => ({ br, bc })))
const moves = {
	ArrowUp: [-1, 0],
	ArrowDown: [1, 0],
	ArrowLeft: [0, -1],
	ArrowRight: [0, 1],
} as const

export default function KillerSudokuBoard(props: DailyBoardProps) {
	const t = createTranslator(props.locale)
	const puzzle = createMemo(() => {
		try {
			return parseKillerSudokuClientPayload(props.puzzle.puzzleData)
		} catch {
			return null
		}
	})
	return (
		<Show when={puzzle()} keyed fallback={<p role="alert">{t('daily.unavailableTitle')}</p>}>
			{(data) => <Board data={data} {...props} />}
		</Show>
	)
}

function Board(props: DailyBoardProps & { data: KillerSudokuPuzzleData }) {
	const t = createTranslator(props.locale)
	const initial = createInitialState(props.data)
	const [state, setState] = createSignal(initial)
	const [history, setHistory] = createSignal<KillerSudokuGameState[]>([])
	const [feedback, setFeedback] = createSignal<'selectBlank' | 'lockedClue' | 'notesNeedBlank'>()
	const wrongCage = createMemo(() =>
		props.data.cages.find((cage) => isCageSumValid(state().cells, cage) === false),
	)
	const finish = createBoardFinish(props, 'killer-sudoku')
	const playing = () => state().gameStatus === 'playing'
	const refs: HTMLButtonElement[][] = Array.from({ length: 9 }, () => [])
	const anchors = props.data.cages.map(({ cells }) =>
		Math.min(...cells.map(([row, col]) => 9 * row + col)),
	)

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
		const next = killerSudokuReducer(previous, action, props.data)
		if (next.cells !== previous.cells) setHistory((stack) => [...stack, previous])
		setState(next)
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
			if (event.key.toLowerCase() === 'z' && !event.shiftKey && history().length) {
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

	const cellAt = (row: number, col: number) => {
		const cell = () => state().cells[row][col]
		const selected = () => state().selectedCell?.[0] === row && state().selectedCell?.[1] === col
		const conflict = () => getCellConflicts(state().cells, props.data.cages, row, col).size > 0
		const { cageId } = initial.cells[row][col]
		const cage = props.data.cages[cageId]
		const showTotal = anchors[cageId] === row * 9 + col
		return (
			<button
				type="button"
				ref={(element) => {
					refs[row][col] = element
				}}
				class={styles.cell}
				classList={{ [cageStyles.hasTotal]: showTotal }}
				onFocus={() => dispatch({ type: 'SELECT_CELL', row, col })}
				onClick={() => dispatch({ type: 'SELECT_CELL', row, col })}
				aria-pressed={selected()}
				aria-invalid={conflict() || undefined}
				disabled={!playing()}
				aria-label={[
					t('common.cellRow', { index: row + 1 }),
					t('common.cellColumn', { index: col + 1 }),
					cell().value,
					t('games.killerSudoku.cageTotal', { sum: cage.sum }),
					cell().notes.size > 0 &&
						t('games.killerSudoku.notes') +
							': ' +
							digits.filter((n) => cell().notes.has(n)).join(', '),
				]
					.filter(Boolean)
					.join(', ')}
				data-selected={selected() || undefined}
				data-given={cell().isGiven || undefined}
				data-filled={cell().value !== null || undefined}
				data-conflict={conflict() || undefined}
			>
				<span
					aria-hidden="true"
					class={cageStyles.edge}
					data-top={initial.cells[row - 1]?.[col]?.cageId !== cageId || undefined}
					data-right={initial.cells[row][col + 1]?.cageId !== cageId || undefined}
					data-bottom={initial.cells[row + 1]?.[col]?.cageId !== cageId || undefined}
					data-left={initial.cells[row][col - 1]?.cageId !== cageId || undefined}
				/>
				<Show when={showTotal}>
					<span class={cageStyles.total} aria-hidden="true">
						{cage.sum}
					</span>
				</Show>
				<Show when={cell().value}>
					<span class={`${styles.value} ${cageStyles.digit}`}>{cell().value}</span>
				</Show>
				<Show when={cell().notes.size}>
					<span class={`${styles.notes} ${cageStyles.notes}`} aria-hidden="true">
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
		<div
			class="play-split sudoku-layout mx-auto flex w-full max-w-[26rem] flex-col gap-3"
			data-killer-sudoku-board
		>
			<div class={`play-board ${styles.board}`}>
				{/* biome-ignore lint/a11y/useSemanticElements: the visual grid is a named group of game controls */}
				<div class={styles.boxes} role="group" aria-label={t('games.killerSudoku.name')}>
					<For each={boxes}>
						{({ br, bc }) => (
							<div class={styles.box}>
								{coords.flatMap((r) => coords.map((c) => cellAt(br * 3 + r, bc * 3 + c)))}
							</div>
						)}
					</For>
				</div>
			</div>
			<div class="play-tools">
				<p role="status" class="min-h-5 text-center text-sm">
					{feedback() ? t(`games.killerSudoku.messages.${feedback()}`) : ''}
					<Show when={wrongCage()} keyed>
						{(cage) => (
							<span class="block text-destructive">
								{t('games.killerSudoku.messages.wrongSum', { sum: cage.sum })}
							</span>
						)}
					</Show>
				</p>
				<div class={styles.pad}>
					<div class={styles.digits}>
						<For each={digits}>
							{(digit) => (
								<button
									type="button"
									class={styles.key}
									disabled={!playing()}
									data-notes={state().notesMode || undefined}
									onClick={() => dispatch({ type: 'SET_VALUE', value: digit })}
								>
									{digit}
								</button>
							)}
						</For>
						<button
							type="button"
							class={`${styles.key} ${styles.erase}`}
							disabled={!playing()}
							aria-label={t('games.sudoku.clear')}
							onClick={() => dispatch({ type: 'CLEAR_CELL' })}
						>
							<Delete size={20} aria-hidden="true" />
						</button>
					</div>
					<div class={styles.tools}>
						<button
							type="button"
							class={[styles.key, styles.tool].join(' ')}
							disabled={!playing() || !history().length}
							onClick={undo}
						>
							<Undo2 size={16} aria-hidden="true" />
							{t('games.sudoku.undo')}
						</button>
						<button
							type="button"
							class={`${styles.key} ${styles.tool}`}
							aria-pressed={state().notesMode}
							disabled={!playing()}
							onClick={() => dispatch({ type: 'TOGGLE_NOTES_MODE' })}
						>
							<PencilLine size={16} aria-hidden="true" />
							{t('games.killerSudoku.notes')}
						</button>
						<button
							type="button"
							class={`${styles.key} ${styles.tool}`}
							disabled={!playing()}
							onClick={() => dispatch({ type: 'RESET' })}
						>
							<RotateCcw size={16} aria-hidden="true" />
							{t('games.killerSudoku.startOver')}
						</button>
					</div>
				</div>
			</div>
			<BoardFinish
				finish={finish}
				locale={props.locale}
				message={t('games.killerSudoku.complete')}
			/>
		</div>
	)
}
