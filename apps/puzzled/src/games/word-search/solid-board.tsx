/** @jsxImportSource solid-js */
import { Check, RotateCcw } from 'lucide-solid'
import { createMemo, createSignal, For, Show } from 'solid-js'
import { BoardFinish, createBoardFinish, type DailyBoardProps } from '@/games/shared/solid/finish'
import { createTranslator } from '@/lib/i18n/translate'
import { parseWordSearchClientPayload, type WordSearchClientData } from './parse-client'
import { getWordFromPositions, type Position } from './types'

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

export default function WordSearchBoard(props: DailyBoardProps) {
	const t = createTranslator(props.locale)
	const puzzle = createMemo(() => {
		try {
			return parseWordSearchClientPayload(props.puzzle.puzzleData)
		} catch {
			return null
		}
	})
	return (
		<Show when={puzzle()} keyed fallback={<p role="alert">{t('daily.unavailableTitle')}</p>}>
			{(data) => <Board {...props} data={data} />}
		</Show>
	)
}

function Board(props: DailyBoardProps & { data: WordSearchClientData }) {
	const t = createTranslator(props.locale)
	const { grid, words, theme } = props.data
	const finish = createBoardFinish(props, 'word-search')
	const locked = () => finish.state() !== 'playing'
	const [found, setFound] = createSignal(new Map<string, Line>())
	const [anchor, setAnchor] = createSignal<Position>()
	const [preview, setPreview] = createSignal<Line>()
	const highlighted = createMemo(() => [...found().values()].flatMap(lineCells))
	const selected = createMemo(() => {
		const drag = preview()
		const start = anchor()
		return drag ? lineCells(drag) : start ? [start] : []
	})
	let pointer: { id: number; start: Position } | undefined
	let board: HTMLFieldSetElement | undefined
	const buttons: HTMLButtonElement[][] = grid.map(() => [])

	function find(line: Line) {
		if (locked()) return
		const text = getWordFromPositions(grid, line.start, line.end)?.toUpperCase()
		if (!text) return
		const match = [text, Array.from(text).reverse().join('')].find(
			(word) => words.includes(word) && !found().has(word),
		)
		if (!match) return
		const next = new Map(found()).set(match, line)
		setFound(next)
		if (next.size === words.length) finish.finish({ foundWords: [...next.keys()] })
	}

	function select(pos: Position) {
		if (locked()) return
		const start = anchor()
		if (start) {
			setAnchor(undefined)
			find({ start, end: pos })
		} else setAnchor(pos)
	}

	function position(event: PointerEvent): Position | undefined {
		const cell = document
			.elementFromPoint(event.clientX, event.clientY)
			?.closest<HTMLElement>('button[data-row][data-col]')
		if (!cell || !board?.contains(cell)) return
		return { row: Number(cell.dataset.row), col: Number(cell.dataset.col) }
	}
	function release(event: PointerEvent, commit: boolean) {
		if (!pointer || pointer.id !== event.pointerId) return
		const { start } = pointer
		pointer = undefined
		setPreview(undefined)
		if (!commit) return
		const end = position(event)
		if (!end) return
		if (same(start, end)) select(end)
		else {
			setAnchor(undefined)
			find({ start, end })
		}
	}

	return (
		<div class="mx-auto w-full max-w-sm space-y-3">
			<div class="flex items-center justify-between gap-2 text-sm">
				<span class="font-semibold">{theme || t('games.wordSearch.name')}</span>
				<output class="tabular-nums" aria-live="polite">
					{found().size}/{words.length}
				</output>
				<button
					type="button"
					class="grid size-11 place-items-center rounded-lg border border-border"
					aria-label={t('common.reset')}
					disabled={locked()}
					onClick={() => {
						setFound(new Map())
						setAnchor(undefined)
					}}
				>
					<RotateCcw size={16} aria-hidden="true" />
				</button>
				<a class="inline-flex min-h-11 items-center underline" href="#rules">
					{t('common.help')}
				</a>
			</div>
			{/* Pointer capture keeps a drag coherent outside the starting cell; keyboard uses the same endpoint selection. */}
			<fieldset
				ref={board}
				class="grid aspect-square w-full touch-none select-none gap-0.5 rounded-xl border border-border bg-surface-muted p-1"
				style={{ 'grid-template-columns': `repeat(${grid.length}, minmax(0, 1fr))` }}
				aria-label={t('games.wordSearch.name')}
				onPointerDown={(event) => {
					if (locked() || pointer || !event.isPrimary || event.button !== 0) return
					const start = position(event)
					if (!start) return
					pointer = { id: event.pointerId, start }
					setPreview({ start, end: start })
					event.currentTarget.setPointerCapture(event.pointerId)
				}}
				onPointerMove={(event) => {
					if (!pointer || pointer.id !== event.pointerId) return
					const end = position(event)
					if (end) setPreview({ start: pointer.start, end })
				}}
				onPointerUp={(event) => release(event, true)}
				onPointerCancel={(event) => release(event, false)}
				onLostPointerCapture={(event) => release(event, false)}
			>
				<For each={grid}>
					{(line, rowIndex) => (
						<For each={line}>
							{(letter, colIndex) => {
								const row = rowIndex()
								const col = colIndex()
								const pos = { row, col }
								return (
									<button
										ref={(el) => {
											buttons[row][col] = el
										}}
										type="button"
										class="grid min-w-0 place-items-center rounded bg-background font-display text-[clamp(.6rem,3.2vw,1rem)] font-bold text-foreground focus-visible:z-10 data-found:bg-emerald-500/25 data-selected:bg-primary data-selected:text-primary-foreground"
										data-row={row}
										data-col={col}
										data-found={highlighted().some((cell) => same(cell, pos)) || undefined}
										data-selected={selected().some((cell) => same(cell, pos)) || undefined}
										aria-label={`${letter}, ${t('common.cellRow', { index: row + 1 })}, ${t('common.cellColumn', { index: col + 1 })}`}
										aria-pressed={selected().some((cell) => same(cell, pos))}
										disabled={locked()}
										onClick={(event) => {
											if (event.detail === 0) select(pos)
										}}
										onKeyDown={(event) => {
											if (event.key === 'Escape') setAnchor(undefined)
											const next =
												event.key === 'ArrowUp'
													? buttons[row - 1]?.[col]
													: event.key === 'ArrowDown'
														? buttons[row + 1]?.[col]
														: event.key === 'ArrowLeft'
															? buttons[row][col - 1]
															: event.key === 'ArrowRight'
																? buttons[row][col + 1]
																: undefined
											if (next) {
												event.preventDefault()
												next.focus()
											}
										}}
									>
										{letter}
									</button>
								)
							}}
						</For>
					)}
				</For>
			</fieldset>
			<ul class="flex flex-wrap justify-center gap-2">
				<For each={words}>
					{(word) => (
						<li
							class="flex items-center gap-1 rounded-full bg-surface-muted px-3 py-1 text-sm data-found:bg-emerald-500/25 data-found:line-through"
							data-found={found().has(word) || undefined}
						>
							<Show when={found().has(word)}>
								<Check size={12} aria-hidden="true" />
							</Show>
							{word}
						</li>
					)}
				</For>
			</ul>
			<BoardFinish finish={finish} locale={props.locale} message={t('games.wordSearch.complete')} />
		</div>
	)
}
