/** @jsxImportSource solid-js */
import { Paintbrush, X } from 'lucide-solid'
import { createMemo, createSignal, For, onCleanup, Show } from 'solid-js'
import { puzzleThemeLabel } from '@/games/shared/puzzle-theme-label'
import { BoardFinish, createBoardFinish, type DailyBoardProps } from '@/games/shared/solid/finish'
import { createTranslator } from '@/lib/i18n/translate'
import { brushCell, type Cell, createBrush, strokeCells } from './brush'
import { parseNonogramClientPayload } from './parse-client'
import zhTwThemes from './puzzle-themes.zh-TW.json'
import {
	type CellState,
	isColClueMet,
	isGridClueComplete,
	isRowClueMet,
	type NonogramPuzzleData,
} from './types'

export default function NonogramBoard(props: DailyBoardProps) {
	const t = createTranslator(props.locale)
	const puzzle = createMemo(() => {
		try {
			return parseNonogramClientPayload(props.puzzle.puzzleData)
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

function Board(props: DailyBoardProps & { data: NonogramPuzzleData }) {
	const t = createTranslator(props.locale)
	const { width, height, rowClues, colClues, theme } = props.data
	const rows = Array.from({ length: height }, (_, index) => index)
	const cols = Array.from({ length: width }, (_, index) => index)
	const emptyGrid = () => rows.map(() => cols.map((): CellState => 'empty'))
	const [grid, setGrid] = createSignal(emptyGrid())
	const [history, setHistory] = createSignal<CellState[][][]>([])
	const [mode, setMode] = createSignal<'filled' | 'marked'>('filled')
	const finish = createBoardFinish(props, 'nonogram')
	const locked = () => finish.state() !== 'playing'
	let stroke:
		| {
				owner: HTMLDivElement
				id: number
				brush: ReturnType<typeof createBrush>
				before: CellState[][]
				last?: Cell
		  }
		| undefined

	function finishIfComplete(next: CellState[][]) {
		if (isGridClueComplete(next, props.data))
			finish.finish({ finalGrid: next.map((line) => line.map((cell) => cell === 'filled')) })
	}

	function applyBrush(cells: Cell[], brush: ReturnType<typeof createBrush>) {
		const current = grid()
		let next = current
		for (const { row, col } of cells) {
			const state = brushCell(current[row][col], brush)
			if (state === current[row][col]) continue
			if (next === current) next = current.slice()
			if (next[row] === current[row]) next[row] = current[row].slice()
			next[row][col] = state
		}
		if (next !== current) setGrid(next)
	}

	function commit(before: CellState[][]) {
		const after = grid()
		if (after === before) return
		setHistory((previous) => [...previous, before])
		finishIfComplete(after)
	}

	function undo() {
		if (locked() || stroke) return
		const previous = history()
		if (!previous.length) return
		setGrid(previous[previous.length - 1])
		setHistory(previous.slice(0, -1))
	}

	function startOver() {
		if (locked()) return
		clearStroke()
		setGrid(emptyGrid())
		setHistory([])
		setDimmed({})
	}

	function cellAt(board: HTMLDivElement, target: EventTarget | null): Cell | undefined {
		const cell =
			target instanceof Element
				? target.closest<HTMLElement>('button[data-paint-row][data-paint-col]')
				: null
		if (!cell || !board.contains(cell)) return
		return { row: Number(cell.dataset.paintRow), col: Number(cell.dataset.paintCol) }
	}

	function extendStroke(event: PointerEvent) {
		if (locked() || stroke?.id !== event.pointerId) return
		const cell = cellAt(stroke.owner, document.elementFromPoint(event.clientX, event.clientY))
		if (cell) applyBrush(strokeCells(stroke.last ?? cell, cell), stroke.brush)
		stroke.last = cell
	}

	function clearStroke() {
		if (!stroke) return
		const { id, owner } = stroke
		stroke = undefined
		if (owner.hasPointerCapture(id)) owner.releasePointerCapture(id)
	}

	function endStroke(event: PointerEvent, commitEndpoint = false) {
		if (stroke?.id !== event.pointerId) return
		const { before } = stroke
		if (commitEndpoint) extendStroke(event)
		clearStroke()
		if (!locked()) commit(before)
	}
	onCleanup(clearStroke)

	// A manual toggle overrides automatic clue completion for that line only.
	const [dimmed, setDimmed] = createSignal<Record<string, boolean>>({})
	const clueDimmed = (id: string, met: boolean) => dimmed()[id] ?? met
	const toggleClue = (id: string, met: boolean) =>
		setDimmed((prev) => ({ ...prev, [id]: !clueDimmed(id, met) }))
	const clueClass =
		'rounded text-[clamp(.55rem,2.5vw,.875rem)] tabular-nums hover:bg-background focus-visible:z-10 aria-pressed:text-muted-foreground [&[aria-pressed=true]>span]:line-through'
	const label = (axis: 'Row' | 'Column', index: number, clues: number[]) =>
		`${t(`common.cell${axis}`, { index: index + 1 })}: ${clues.join(', ') || '0'}`
	const modeClass =
		'flex min-h-11 items-center gap-2 rounded-xl border border-border px-4 font-semibold aria-pressed:border-primary aria-pressed:bg-primary aria-pressed:text-primary-foreground'
	return (
		<div class="mx-auto w-full max-w-[30rem] space-y-3">
			<div class="flex items-center justify-between gap-2 text-sm text-muted-foreground">
				<span>
					{finish.state() === 'accepted'
						? puzzleThemeLabel(theme, props.locale, zhTwThemes, t('games.nonogram.name'))
						: `${width}×${height}`}
				</span>
				<a class="inline-flex min-h-11 items-center underline" href="#rules">
					{t('common.help')}
				</a>
			</div>
			<div
				class="grid w-full overflow-hidden rounded-xl border border-border bg-surface-muted p-1"
				style={{ 'grid-template-columns': `auto repeat(${width}, minmax(0, 1fr))` }}
				onPointerDown={(event) => {
					const alternate = event.button === 2
					if (locked() || stroke || !event.isPrimary || (!alternate && event.button !== 0)) return
					const cell = cellAt(event.currentTarget, event.target)
					if (!cell) return
					const selected = mode()
					const ink = alternate ? (selected === 'filled' ? 'marked' : 'filled') : selected
					const brush = createBrush(grid()[cell.row][cell.col], ink, alternate)
					stroke = {
						owner: event.currentTarget,
						id: event.pointerId,
						brush,
						before: grid(),
						last: cell,
					}
					event.currentTarget.setPointerCapture(event.pointerId)
					applyBrush([cell], brush)
				}}
				onPointerMove={extendStroke}
				onPointerUp={(event) => endStroke(event, true)}
				onPointerCancel={endStroke}
				onLostPointerCapture={endStroke}
				onContextMenu={(event) => {
					if (event.target === event.currentTarget || cellAt(event.currentTarget, event.target))
						event.preventDefault()
				}}
			>
				<div />
				<For each={colClues}>
					{(clues, col) => (
						<button
							type="button"
							id={`paint-col-${col()}`}
							aria-label={label('Column', col(), clues)}
							class={`flex flex-col items-center justify-end pb-1 leading-tight ${clueClass}`}
							aria-pressed={clueDimmed(
								`paint-col-${col()}`,
								isColClueMet(grid(), props.data, col()),
							)}
							onClick={() =>
								toggleClue(`paint-col-${col()}`, isColClueMet(grid(), props.data, col()))
							}
						>
							<For each={clues} fallback={<span>0</span>}>
								{(n) => <span>{n}</span>}
							</For>
						</button>
					)}
				</For>
				<For each={rows}>
					{(row) => (
						<>
							<button
								type="button"
								id={`paint-row-${row}`}
								aria-label={label('Row', row, rowClues[row])}
								class={`flex items-center justify-end gap-0.5 px-1 ${clueClass}`}
								aria-pressed={clueDimmed(`paint-row-${row}`, isRowClueMet(grid(), props.data, row))}
								onClick={() =>
									toggleClue(`paint-row-${row}`, isRowClueMet(grid(), props.data, row))
								}
							>
								<For each={rowClues[row]} fallback={<span>0</span>}>
									{(n) => <span>{n}</span>}
								</For>
							</button>
							<For each={cols}>
								{(col) => (
									<button
										type="button"
										class="flex aspect-square min-w-0 touch-none select-none items-center justify-center border border-border bg-background text-muted-foreground focus-visible:z-10 data-filled:bg-foreground data-divider-col:border-r-foreground/50 data-divider-row:border-b-foreground/50"
										aria-label={`${t('common.cellRow', { index: row + 1 })}, ${t('common.cellColumn', { index: col + 1 })}`}
										aria-describedby={`paint-row-${row} paint-col-${col}`}
										data-paint-row={row}
										data-paint-col={col}
										aria-pressed={
											grid()[row][col] === 'filled'
												? true
												: grid()[row][col] === 'marked'
													? 'mixed'
													: false
										}
										data-filled={grid()[row][col] === 'filled' || undefined}
										data-marked={grid()[row][col] === 'marked' || undefined}
										data-divider-col={(col % 5 === 4 && col + 1 < width) || undefined}
										data-divider-row={(row % 5 === 4 && row + 1 < height) || undefined}
										disabled={locked()}
										onClick={(event) => {
											if (event.detail !== 0 || locked() || stroke) return
											const before = grid()
											applyBrush([{ row, col }], createBrush(before[row][col], mode()))
											commit(before)
										}}
									>
										<Show when={grid()[row][col] === 'marked'}>
											<X class="size-3/5" aria-hidden="true" />
										</Show>
									</button>
								)}
							</For>
						</>
					)}
				</For>
			</div>
			<div class="flex justify-center gap-2">
				<button
					type="button"
					class={modeClass}
					aria-pressed={mode() === 'filled'}
					disabled={locked()}
					onClick={() => setMode('filled')}
				>
					<Paintbrush size={16} aria-hidden="true" />
					{t('games.nonogram.fillMode')}
				</button>
				<button
					type="button"
					class={modeClass}
					aria-pressed={mode() === 'marked'}
					disabled={locked()}
					onClick={() => setMode('marked')}
				>
					<X size={16} aria-hidden="true" />
					{t('games.nonogram.markMode')}
				</button>
			</div>
			<Show when={!locked()}>
				<div class="flex flex-wrap items-center justify-center gap-2">
					<button
						type="button"
						class="min-h-12 rounded-xl border border-border px-3 font-semibold disabled:opacity-50"
						disabled={!history().length}
						onClick={undo}
					>
						{t('games.nonogram.undo')}
					</button>
					<button
						type="button"
						class="min-h-12 rounded-xl border border-border px-3 font-semibold"
						onClick={startOver}
					>
						{t('games.nonogram.startOver')}
					</button>
				</div>
			</Show>
			<BoardFinish finish={finish} locale={props.locale} message={t('games.nonogram.complete')} />
		</div>
	)
}
