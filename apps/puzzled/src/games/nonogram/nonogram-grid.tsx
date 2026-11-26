/** @jsxImportSource solid-js */
import { X } from 'lucide-solid'
import { For, Show } from 'solid-js'
import type { Translate } from '@/lib/i18n/translate'
import type { NonogramPlay } from './create-nonogram-play'
import { isColClueMet, isRowClueMet, type NonogramPuzzleData } from './types'

const arrowMoves = { ArrowUp: [-1, 0], ArrowDown: [1, 0], ArrowLeft: [0, -1], ArrowRight: [0, 1] }

type GridPlay = Pick<
	NonogramPlay,
	| 'rows'
	| 'cols'
	| 'grid'
	| 'locked'
	| 'active'
	| 'activate'
	| 'clickCell'
	| 'beginStroke'
	| 'extendStroke'
	| 'endStroke'
	| 'restoreFocusedCell'
	| 'blurGrid'
	| 'preventCellContextMenu'
	| 'conflicts'
	| 'clueDimmed'
	| 'toggleClue'
>

export function NonogramGrid(props: { data: NonogramPuzzleData; play: GridPlay; t: Translate }) {
	const { width, height, rowClues, colClues } = props.data
	const t = props.t
	const {
		rows,
		cols,
		grid,
		locked,
		active,
		activate,
		clickCell,
		beginStroke,
		extendStroke,
		endStroke,
		restoreFocusedCell,
		blurGrid,
		preventCellContextMenu,
		conflicts,
		clueDimmed,
		toggleClue,
	} = props.play
	const rowConflict = (row: number) => conflicts().rows.includes(row) || undefined
	const colConflict = (col: number) => conflicts().columns.includes(col) || undefined
	const clueClass =
		'group rounded text-[clamp(.55rem,2.5vw,.875rem)] tabular-nums hover:bg-background focus-visible:z-10 aria-pressed:text-muted-foreground data-active:bg-accent-warm-soft not-data-conflict:data-active:text-foreground data-conflict:text-destructive data-conflict:inset-ring-2 data-conflict:inset-ring-destructive [&[aria-pressed=true]:not([data-conflict])>span:not([aria-hidden])]:line-through'
	// Reserve space for the cue in both states, so the grid tracks never resize.
	const conflictCueClass = 'invisible font-bold group-data-conflict:visible'
	// Keep the touch gutter inside the clue button so browser hit adjustment
	// cannot send a tap in dead space to a paint cell. The grid tracks never overlap.
	const rowClueClass =
		'flex items-center justify-end gap-0.5 px-1 pointer-coarse:min-w-10.5 pointer-coarse:pe-4.5'
	const label = (axis: 'Row' | 'Column', index: number, clues: number[]) =>
		`${t(`common.cell${axis}`, { index: index + 1 })}: ${clues.join(', ') || '0'}`
	const buttons: HTMLButtonElement[] = []

	function moveFocus(event: KeyboardEvent, row: number, col: number) {
		if (locked() || !Object.hasOwn(arrowMoves, event.key)) return
		event.preventDefault()
		const [dr, dc] = arrowMoves[event.key as keyof typeof arrowMoves]
		const nextRow = Math.max(0, Math.min(height - 1, row + dr))
		const nextCol = Math.max(0, Math.min(width - 1, col + dc))
		if (nextRow === row && nextCol === col) activate({ row, col })
		else buttons[nextRow * width + nextCol]?.focus({ preventScroll: true })
	}

	return (
		<div
			class="play-board grid w-full overflow-hidden rounded-xl border border-border bg-surface-muted p-1"
			style={{ 'grid-template-columns': `auto repeat(${width}, minmax(0, 1fr))` }}
			onPointerDown={beginStroke}
			onPointerLeave={(event) => restoreFocusedCell(event.currentTarget)}
			onFocusOut={blurGrid}
			onPointerMove={extendStroke}
			onPointerUp={(event) => endStroke(event, true)}
			onPointerCancel={endStroke}
			onLostPointerCapture={endStroke}
			onContextMenu={preventCellContextMenu}
		>
			<div />
			<For each={colClues}>
				{(clues, col) => (
					<button
						type="button"
						id={`paint-col-${col()}`}
						aria-label={label('Column', col(), clues)}
						aria-invalid={colConflict(col())}
						data-active={active()?.col === col() || undefined}
						data-conflict={colConflict(col())}
						class={`flex flex-col items-center justify-end pb-1 leading-tight ${clueClass}`}
						aria-pressed={clueDimmed(`paint-col-${col()}`, isColClueMet(grid(), props.data, col()))}
						onClick={() =>
							toggleClue(`paint-col-${col()}`, isColClueMet(grid(), props.data, col()))
						}
					>
						<span aria-hidden="true" class={conflictCueClass}>
							!
						</span>
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
							aria-invalid={rowConflict(row)}
							data-active={active()?.row === row || undefined}
							data-conflict={rowConflict(row)}
							class={`${rowClueClass} ${clueClass}`}
							aria-pressed={clueDimmed(`paint-row-${row}`, isRowClueMet(grid(), props.data, row))}
							onClick={() => toggleClue(`paint-row-${row}`, isRowClueMet(grid(), props.data, row))}
						>
							<span aria-hidden="true" class={conflictCueClass}>
								!
							</span>
							<For each={rowClues[row]} fallback={<span>0</span>}>
								{(n) => <span>{n}</span>}
							</For>
						</button>
						<For each={cols}>
							{(col) => (
								<button
									type="button"
									ref={(button) => (buttons[row * width + col] = button)}
									class="flex aspect-square min-w-0 touch-none select-none items-center justify-center border border-border bg-background text-muted-foreground focus-visible:z-10 data-filled:bg-foreground not-data-filled:data-crosshair:bg-accent-warm-soft/60 data-divider-col:border-r-foreground/50 data-divider-row:border-b-foreground/50"
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
									data-crosshair={active()?.row === row || active()?.col === col || undefined}
									data-filled={grid()[row][col] === 'filled' || undefined}
									data-marked={grid()[row][col] === 'marked' || undefined}
									data-divider-col={(col % 5 === 4 && col + 1 < width) || undefined}
									data-divider-row={(row % 5 === 4 && row + 1 < height) || undefined}
									disabled={locked()}
									onPointerEnter={() => activate({ row, col })}
									onFocus={() => activate({ row, col })}
									onKeyDown={(event) => moveFocus(event, row, col)}
									onClick={(event) => clickCell(event, row, col)}
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
	)
}
