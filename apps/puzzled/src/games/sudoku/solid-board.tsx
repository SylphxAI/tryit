/** @jsxImportSource solid-js */
import { Delete, PencilLine, Undo2 } from 'lucide-solid'
import { createEffect, createMemo, createSignal, For, onCleanup, onMount, Show } from 'solid-js'
import type { DailySnapshot } from '@/features/daily/lib/daily-fallback'
import type { PuzzleDifficulty } from '@/games/types'
import { isAlreadyPlayedError } from '@/lib/connect/already-played'
import { shareResult, submitGuess } from '@/lib/connect/puzzle-client'
import type { Locale } from '@/lib/i18n/config'
import { createTranslator } from '@/lib/i18n/translate'
import { withIdempotencyKey } from '@/lib/idempotency-key'
import styles from './components/sudoku-craft.module.css'
import { parseSudokuClientPayload } from './parse-client'
import { createInitialState, type SudokuAction, sudokuReducer } from './state'
import { BOX_SIZE, isValidPlacement, type SudokuPuzzleClientData } from './types'

const digits = [1, 2, 3, 4, 5, 6, 7, 8, 9]
const coords = [0, 1, 2]
const moves = { ArrowUp: 'up', ArrowDown: 'down', ArrowLeft: 'left', ArrowRight: 'right' } as const

type Props = {
	puzzle: Extract<DailySnapshot, { kind: 'playable' }>
	locale: Locale
	difficulty?: PuzzleDifficulty
	onAlreadyPlayed: () => void
}

export default function SudokuBoard(props: Props) {
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

function Board(props: Props & { data: SudokuPuzzleClientData }) {
	const t = createTranslator(props.locale)
	const [state, setState] = createSignal(createInitialState(props.data))
	const [result, setResult] = createSignal<'pending' | 'accepted' | 'failed'>()
	const [sharing, setSharing] = createSignal(false)
	const [shareError, setShareError] = createSignal(false)
	const dispatch = (action: SudokuAction) =>
		setState((previous) => sudokuReducer(previous, action, props.data))
	const values = createMemo(() => state().userGrid.map((row) => row.map((cell) => cell.value)))
	let submitInput: ReturnType<typeof makeSubmission> | undefined
	const startedAt = Date.now()

	function makeSubmission() {
		return withIdempotencyKey({
			gameSlug: 'sudoku',
			status: 'won' as const,
			attempts: 1,
			timeSpentMs: Math.max(0, (state().endTime ?? Date.now()) - startedAt),
			difficulty: props.difficulty ?? props.data.difficulty,
			puzzleDate: props.puzzle.puzzleDate,
			puzzleId: props.puzzle.puzzleId,
			submission: { finalGrid: values() },
		})
	}
	async function finish() {
		if (result() === 'pending' || result() === 'accepted') return
		submitInput ??= makeSubmission()
		setResult('pending')
		try {
			const response = await submitGuess(submitInput)
			if (response.valid && response.status === 'won') setResult('accepted')
			else if (isAlreadyPlayedError(response.error)) props.onAlreadyPlayed()
			else setResult('failed')
		} catch (error) {
			if (isAlreadyPlayedError(error)) props.onAlreadyPlayed()
			else setResult('failed')
		}
	}
	createEffect(() => {
		if (state().isComplete && !submitInput) void finish()
	})

	async function share() {
		if (sharing()) return
		setSharing(true)
		setShareError(false)
		try {
			const id = await shareResult({
				gameSlug: 'sudoku',
				puzzleDate: props.puzzle.puzzleDate,
				tap: true,
			})
			if (!id) throw new Error('missing_share_id')
			const url = new URL(`/r/${encodeURIComponent(id)}`, window.location.origin).href
			if (navigator.share) await navigator.share({ title: t('games.sudoku.name'), url })
			else await navigator.clipboard.writeText(url)
		} catch (error) {
			if (!(error instanceof DOMException && error.name === 'AbortError')) setShareError(true)
		} finally {
			setSharing(false)
		}
	}
	onMount(() => {
		function keydown(event: KeyboardEvent) {
			if (
				!state().selectedCell ||
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
			if (action) {
				event.preventDefault()
				dispatch(action)
			}
		}
		window.addEventListener('keydown', keydown)
		onCleanup(() => window.removeEventListener('keydown', keydown))
	})

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
		const conflict = () => {
			const v = cell().value
			return !cell().isGiven && v !== null && !isValidPlacement(values(), row, col, v)
		}
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
		<div class="mx-auto flex w-full max-w-[26rem] flex-col gap-4">
			<div class={styles.board}>
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
				</div>
			</div>
			<Show when={result() === 'accepted'}>
				<div class="tactile-card space-y-2 p-4" role="status">
					<h2 class="font-display text-xl">{t('gameResult.congratulations')}</h2>
					<p>{t('games.sudoku.complete')}</p>
					<button
						type="button"
						class="min-h-11 font-semibold underline"
						disabled={sharing()}
						onClick={() => void share()}
					>
						{t('common.share')}
					</button>
				</div>
			</Show>
			<Show when={result() === 'failed'}>
				<div role="alert">
					{t('common.error')}{' '}
					<button
						type="button"
						class="min-h-11 font-semibold underline"
						onClick={() => void finish()}
					>
						{t('common.retry')}
					</button>
				</div>
			</Show>
			<Show when={shareError()}>
				<p role="alert">{t('common.error')}</p>
			</Show>
		</div>
	)
}
