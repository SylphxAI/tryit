/** @jsxImportSource solid-js */
import { createMemo, createSignal, For, onCleanup, onMount, Show } from 'solid-js'
import { playButton } from '@/features/catalog/solid/game-landing'
import { BoardFinish, createBoardFinish, type DailyBoardProps } from '@/games/shared/solid/finish'
import { createTranslator } from '@/lib/i18n/translate'
import { triggerHaptic } from '@/shared/hooks/use-haptic'
import { type CrosswordAction, createInitialState, crosswordReducer } from './board-state'
import { incorrectCells } from './check-feedback'
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
	const [feedback, setFeedback] = createSignal<'incomplete' | 'incorrect'>()
	const [wrongCells, setWrongCells] = createSignal(0)
	const finish = createBoardFinish(props, 'crossword', {
		onRejected(error) {
			setWrongCells(incorrectCells(error))
			setFeedback('incorrect')
		},
	})
	const [state, setState] = createSignal(createInitialState(data))
	const playing = () => finish.state() === 'playing'
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
	function focusCell() {
		const cell = state().selectedCell
		if (cell) cells[token(cell.row, cell.col)]?.focus()
	}
	function inClue(clue: CrosswordClue, row: number, col: number, direction: CrosswordDirection) {
		return direction === 'across'
			? row === clue.row && col >= clue.col && col < clue.col + clue.length
			: col === clue.col && row >= clue.row && row < clue.row + clue.length
	}
	const activeClue = createMemo(() => {
		const { direction, selectedCell } = state()
		if (selectedCell)
			return data.clues[direction].find((clue) =>
				inClue(clue, selectedCell.row, selectedCell.col, direction),
			)
	})
	const directionName = (direction: CrosswordDirection) =>
		t(direction === 'across' ? 'games.crossword.across' : 'games.crossword.down')
	function selectClue(clue: CrosswordClue, direction: CrosswordDirection) {
		dispatch({ type: 'SELECT_CELL', row: clue.row, col: clue.col, direction })
		focusCell()
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
		<div class="mx-auto flex w-full max-w-md flex-col gap-2 md:gap-4" data-crossword-board>
			<div class="flex flex-wrap items-center justify-between gap-x-3 text-sm">
				<p>{acrossOnly ? t('games.crossword.acrossOnly') : t('games.crossword.name')}</p>
			</div>
			<p role="status" class="min-h-12 rounded-xl bg-muted p-3 text-sm font-semibold">
				{activeClueLabel()}
			</p>
			<fieldset
				class="mx-auto grid w-full max-w-64 grid-cols-5 gap-1 rounded-xl border border-border bg-border p-1 md:max-w-xs"
				aria-label={t('games.crossword.name')}
				dir="ltr"
			>
				<For each={data.grid}>
					{(row, r) => (
						<For each={row}>
							{(cell, c) => {
								if (cell === null)
									return (
										<span class="aspect-square rounded-sm bg-foreground/85" aria-hidden="true" />
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
										class="relative grid aspect-square place-items-center rounded-sm bg-background font-display text-xl font-bold data-word:bg-primary/15 aria-pressed:bg-primary aria-pressed:text-primary-foreground aria-invalid:ring-2 aria-invalid:ring-inset aria-invalid:ring-destructive focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-foreground"
										data-word={(!selected() && highlighted()) || undefined}
										aria-invalid={Boolean(wrongCells() & cellBit(r(), c())) || undefined}
										data-crossword-cell={token(r(), c())}
										onClick={() => dispatch({ type: 'SELECT_CELL', row: r(), col: c() })}
									>
										<Show when={number}>
											<span
												aria-hidden="true"
												class="absolute top-0.5 left-1 font-sans text-[0.625rem] leading-none"
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
			<Show when={playing()}>
				<div class="flex flex-col gap-1" dir="ltr">
					<For each={keyboard}>
						{(row) => (
							<div class="flex justify-center gap-1">
								<For each={row.split('')}>
									{(key) => (
										<button
											type="button"
											aria-label={key === '⌫' ? t('games.wordGuess.keyboard.delete') : key}
											class="min-h-11 w-[9.5%] rounded-lg border border-border bg-muted font-semibold hover:bg-primary/15"
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
				<button type="button" class={playButton} onClick={check}>
					{t('games.crossword.check')}
				</button>
				<Show when={feedback()}>
					<p role="alert" class="text-sm text-destructive">
						{t(`games.crossword.messages.${feedback()}`)}
					</p>
				</Show>
			</Show>
			<BoardFinish
				finish={finish}
				locale={props.locale}
				message={t('games.crossword.complete')}
				shareTitle={t('games.crossword.name')}
			/>
			<div class="grid gap-3 sm:grid-cols-2">
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
												class="min-h-11 w-full rounded-lg px-2 text-start text-sm aria-current:bg-primary/15"
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
		</div>
	)
}
