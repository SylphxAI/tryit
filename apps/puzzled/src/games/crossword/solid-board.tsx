/** @jsxImportSource solid-js */
import { ArrowDownUp, ChevronLeft, ChevronRight } from 'lucide-solid'
import { createMemo, createSignal, For, onCleanup, onMount, Show } from 'solid-js'
import { playButton } from '@/features/catalog/solid/game-landing'
import { BoardFinish, createBoardFinish, type DailyBoardProps } from '@/games/shared/solid/finish'
import { createTranslator } from '@/lib/i18n/translate'
import { triggerHaptic } from '@/shared/hooks/use-haptic'
import {
	type CrosswordAction,
	createInitialState,
	crosswordReducer,
	findActiveClue,
	inClue,
} from './board-state'
import { incorrectCells } from './check-feedback'
import styles from './crossword.module.css'
import { parseCrosswordClientPayload } from './parse-client'
import {
	type CrosswordClue,
	type CrosswordDirection,
	type CrosswordPuzzleClientData,
	GRID_SIZE,
	hasDownClues,
} from './types'

const keyboard = ['QWERTYUIOP', 'ASDFGHJKL', 'ZXCVBNM⌫']
const directions = ['across', 'down'] as const
const clueControl =
	'rounded-lg enabled:hover:bg-accent-warm-soft enabled:active:bg-background focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-foreground disabled:opacity-45'
const clueArrow = `grid min-h-11 min-w-11 shrink-0 place-items-center bg-card ${clueControl}`
const cellBit = (row: number, col: number) => 1 << (row * GRID_SIZE + col)

export default function CrosswordBoard(props: DailyBoardProps) {
	const t = createTranslator(props.locale)
	const puzzle = createMemo(() => {
		try {
			return parseCrosswordClientPayload(props.puzzle.puzzleData)
		} catch {
			return null
		}
	})
	return (
		<Show when={puzzle()} keyed fallback={<p role="alert">{t('daily.unavailableTitle')}</p>}>
			{(data) => <Crossword {...props} data={data} />}
		</Show>
	)
}

function Crossword(props: DailyBoardProps & { data: CrosswordPuzzleClientData }) {
	const t = createTranslator(props.locale)
	const data = props.data
	const acrossOnly = !hasDownClues(data.clues)
	const clueCount = data.clues.across.length + data.clues.down.length
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
	const incomplete = t('games.crossword.messages.incomplete')
	const cells: Record<string, HTMLButtonElement> = {}
	const numbers = new Map(
		[...data.clues.across, ...data.clues.down].map((clue) => [
			token(clue.row, clue.col),
			clue.number,
		]),
	)

	function token(row: number, col: number) {
		return `${row},${col}`
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
		if (cell) cells[token(cell.row, cell.col)]?.focus(options)
	}
	const activeClue = createMemo(() => findActiveClue(state(), data.clues))
	const directionName = (direction: CrosswordDirection) =>
		t(direction === 'across' ? 'games.crossword.across' : 'games.crossword.down')
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
	const clueLabel = (clue: CrosswordClue, direction: CrosswordDirection) =>
		`${clue.number} ${directionName(direction)}: ${clue.clue}`

	onMount(() => {
		window.addEventListener('keydown', keydown)
		onCleanup(() => window.removeEventListener('keydown', keydown))
	})
	const activeClueLabel = () => {
		const clue = activeClue()
		return clue ? clueLabel(clue, state().direction) : t('games.crossword.selectCell')
	}

	return (
		<div
			class="play-split mx-auto flex w-full max-w-md flex-col gap-2 md:gap-4"
			data-crossword-board
		>
			<div
				class={`play-meta flex flex-wrap items-center justify-between gap-x-3 pb-1 text-sm font-semibold text-muted-foreground ${styles.meta}`}
			>
				<Show when={!acrossOnly} fallback={<span>{t('games.crossword.acrossOnly')}</span>}>
					<span class="tabular-nums" dir="ltr">
						{filled()} / {total}
					</span>
					<span>{directionName(state().direction)}</span>
				</Show>
			</div>

			<fieldset
				class="play-board mx-auto grid w-full max-w-64 grid-cols-5 gap-1 rounded-xl border-2 border-foreground/85 bg-border p-1 shadow-sm md:max-w-xs dark:border-foreground/60"
				aria-label={t('games.crossword.name')}
				dir="ltr"
			>
				<For each={data.grid}>
					{(row, r) => (
						<For each={row}>
							{(cell, c) => {
								if (cell === null)
									return (
										<span
											class="aspect-square rounded-sm border border-border bg-ink"
											aria-hidden="true"
										/>
									)
								const selected = () =>
									state().selectedCell?.row === r() && state().selectedCell?.col === c()
								const number = numbers.get(token(r(), c()))
								const letter = () => state().userGrid[r()][c()]
								const highlighted = () => {
									const clue = activeClue()
									return clue && inClue(clue, r(), c(), state().direction)
								}
								return (
									<button
										ref={(node) => {
											cells[token(r(), c())] = node
										}}
										type="button"
										tabindex={selected() ? 0 : -1}
										disabled={!playing()}
										aria-pressed={selected()}
										aria-label={[
											t('common.cellRow', { index: r() + 1 }),
											t('common.cellColumn', { index: c() + 1 }),
											letter(),
										]
											.filter(Boolean)
											.join(', ')}
										class={`relative grid aspect-square place-items-center rounded-sm bg-card font-display text-xl font-bold text-foreground data-word:bg-accent-warm-soft aria-pressed:bg-accent-warm aria-pressed:text-on-accent focus-visible:z-10 focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-info ${styles.cell}`}
										data-word={(!selected() && highlighted()) || undefined}
										aria-invalid={Boolean(wrongCells() & cellBit(r(), c())) || undefined}
										data-crossword-cell={token(r(), c())}
										onClick={() => dispatch({ type: 'SELECT_CELL', row: r(), col: c() })}
									>
										<Show when={number}>
											<span
												aria-hidden="true"
												class="absolute top-1 left-1.5 font-sans text-[0.625rem] leading-none tabular-nums"
											>
												{number}
											</span>
										</Show>
										{letter()}
									</button>
								)
							}}
						</For>
					)}
				</For>
			</fieldset>
			<div class="play-tools flex flex-col gap-2">
				<div
					class="flex items-center gap-1 rounded-xl border border-border bg-accent-warm-soft p-1"
					data-crossword-clue-bar
				>
					<button
						type="button"
						class={clueArrow}
						aria-label={t('games.crossword.previousClue')}
						disabled={!playing() || clueCount <= 1}
						onClick={(event) => stepClue(-1, event)}
					>
						<ChevronLeft size={20} aria-hidden="true" />
					</button>
					<Show
						when={!acrossOnly}
						fallback={
							<span role="status" class="min-w-0 flex-1 wrap-anywhere px-2 text-sm font-semibold">
								{activeClueLabel()}
							</span>
						}
					>
						<button
							type="button"
							class={`flex min-h-11 min-w-0 flex-1 items-center justify-between gap-1 px-2 text-start text-sm font-semibold ${clueControl}`}
							disabled={!playing()}
							onClick={() => {
								dispatch({ type: 'TOGGLE_DIRECTION' })
								focusCell({ preventScroll: true })
							}}
						>
							<span class="min-w-0 wrap-anywhere">{activeClueLabel()}</span>
							<ArrowDownUp size={14} class="shrink-0 text-muted-foreground" aria-hidden="true" />
							<span class="sr-only">{t('games.crossword.switchDirection')}</span>
						</button>
						<span role="status" class="sr-only">
							{activeClueLabel()}
						</span>
					</Show>
					<button
						type="button"
						class={clueArrow}
						aria-label={t('games.crossword.nextClue')}
						disabled={!playing() || clueCount <= 1}
						onClick={(event) => stepClue(1, event)}
					>
						<ChevronRight size={20} aria-hidden="true" />
					</button>
				</div>
				<Show when={playing() || finish.state() === 'pending'}>
					<div class="flex flex-col gap-1" dir="ltr">
						<For each={keyboard}>
							{(row) => (
								<div class="flex justify-center gap-1">
									<For each={row.split('')}>
										{(key) => (
											<button
												type="button"
												aria-label={key === '⌫' ? t('games.wordGuess.keyboard.delete') : key}
												disabled={!playing()}
												class="min-h-11 w-[9.5%] min-w-0 rounded-lg border border-border bg-card font-semibold inset-shadow-[0_-2px_var(--color-border)] enabled:hover:bg-accent-warm-soft enabled:active:bg-accent-warm enabled:active:text-on-accent enabled:active:inset-shadow-none focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-info"
												onClick={() => enter(key)}
											>
												{key}
											</button>
										)}
									</For>
								</div>
							)}
						</For>
					</div>
					<button type="button" class={playButton} disabled={!playing()} onClick={check}>
						{t('games.crossword.check')}
					</button>
					{/* Reserve the wrapped height of the longest message without announcing it. */}
					<div class="grid min-h-6 text-sm text-destructive">
						<span aria-hidden="true" class="invisible col-start-1 row-start-1">
							{incomplete}
						</span>
						<p role="alert" class="col-start-1 row-start-1">
							{feedback() === 'incomplete'
								? incomplete
								: feedback()
									? t('games.crossword.messages.incorrect')
									: ''}
						</p>
					</div>
				</Show>
				<BoardFinish
					finish={finish}
					locale={props.locale}
					message={t('games.crossword.complete')}
					shareTitle={t('games.crossword.name')}
				/>
				<details class="crossword-clues">
					<summary class="min-h-11 cursor-pointer py-2 text-sm font-semibold">
						{t('games.crossword.clues')}
					</summary>
					<div class="grid grid-cols-2 gap-3">
						<For each={acrossOnly ? ['across' as const] : directions}>
							{(direction) => (
								<section class="space-y-1">
									<h3 class="font-display font-bold">{directionName(direction)}</h3>
									<ol class="space-y-1">
										<For each={data.clues[direction]}>
											{(clue) => (
												<li>
													<button
														type="button"
														disabled={!playing()}
														aria-current={activeClue() === clue ? 'true' : undefined}
														class="min-h-11 w-full rounded-lg px-2 text-start text-sm wrap-anywhere enabled:hover:bg-muted aria-current:bg-accent-warm-soft aria-current:font-semibold aria-current:enabled:hover:bg-accent-warm-soft"
														onClick={() => selectClue(clue, direction)}
													>
														<strong>{clue.number}.</strong> {clue.clue}
													</button>
												</li>
											)}
										</For>
									</ol>
								</section>
							)}
						</For>
					</div>
				</details>
			</div>
		</div>
	)
}
