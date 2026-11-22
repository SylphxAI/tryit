/** @jsxImportSource solid-js */
import { Paintbrush, X } from 'lucide-solid'
import { createMemo, createSignal, For, Show } from 'solid-js'
import { BoardFinish, createBoardFinish, type DailyBoardProps } from '@/games/shared/solid/finish'
import { createTranslator } from '@/lib/i18n/translate'
import { parseNonogramClientPayload } from './parse-client'
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
	const [grid, setGrid] = createSignal(rows.map(() => cols.map((): CellState => 'empty')))
	const [mode, setMode] = createSignal<'filled' | 'marked'>('filled')
	const finish = createBoardFinish(props, 'nonogram')
	const locked = () => finish.state() !== 'playing'
	const toggle = (row: number, col: number, alternate = false) => {
		if (locked()) return
		const nextMode = alternate ? (mode() === 'filled' ? 'marked' : 'filled') : mode()
		const current = grid()[row][col]
		if (alternate && current !== 'empty' && current !== nextMode) return
		const next = grid().slice()
		next[row] = next[row].slice()
		next[row][col] = current === nextMode ? 'empty' : nextMode
		setGrid(next)
		if (isGridClueComplete(next, props.data))
			finish.finish({ finalGrid: next.map((line) => line.map((cell) => cell === 'filled')) })
	}
	const label = (axis: 'Row' | 'Column', index: number, clues: number[]) =>
		`${t(`common.cell${axis}`, { index: index + 1 })}: ${clues.join(', ')}`
	const modeClass =
		'flex min-h-11 items-center gap-2 rounded-xl border border-border px-4 font-semibold aria-pressed:border-primary aria-pressed:bg-primary aria-pressed:text-primary-foreground'
	return (
		<div class="mx-auto w-full max-w-[30rem] space-y-3">
			<div class="flex items-center justify-between gap-2 text-sm text-muted-foreground">
				<span>{theme || t('games.nonogram.name')}</span>
				<a class="inline-flex min-h-11 items-center underline" href="#rules">
					{t('common.help')}
				</a>
			</div>
			<div
				class="grid w-full overflow-hidden rounded-xl border border-border bg-surface-muted p-1"
				style={{ 'grid-template-columns': `auto repeat(${width}, minmax(0, 1fr))` }}
			>
				<div />
				<For each={colClues}>
					{(clues, col) => (
						<div
							id={`paint-col-${col()}`}
							role="img"
							aria-label={label('Column', col(), clues)}
							class="flex flex-col items-center justify-end pb-1 text-[clamp(.55rem,2.5vw,.875rem)] leading-tight tabular-nums data-done:text-muted-foreground"
							data-done={isColClueMet(grid(), props.data, col()) || undefined}
						>
							<For each={clues}>{(n) => <span>{n}</span>}</For>
						</div>
					)}
				</For>
				<For each={rows}>
					{(row) => (
						<>
							<div
								id={`paint-row-${row}`}
								role="img"
								aria-label={label('Row', row, rowClues[row])}
								class="flex items-center justify-end gap-0.5 px-1 text-[clamp(.55rem,2.5vw,.875rem)] tabular-nums data-done:text-muted-foreground"
								data-done={isRowClueMet(grid(), props.data, row) || undefined}
							>
								<For each={rowClues[row]}>{(n) => <span>{n}</span>}</For>
							</div>
							<For each={cols}>
								{(col) => (
									<button
										type="button"
										class="flex aspect-square min-w-0 items-center justify-center border border-border bg-background text-muted-foreground focus-visible:z-10 data-filled:bg-foreground data-divider-col:border-r-foreground/50 data-divider-row:border-b-foreground/50"
										aria-label={`${t('common.cellRow', { index: row + 1 })}, ${t('common.cellColumn', { index: col + 1 })}`}
										aria-describedby={`paint-row-${row} paint-col-${col}`}
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
										onClick={() => toggle(row, col)}
										onContextMenu={(event) => {
											event.preventDefault()
											toggle(row, col, true)
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
			<BoardFinish finish={finish} locale={props.locale} message={t('games.nonogram.complete')} />
		</div>
	)
}
