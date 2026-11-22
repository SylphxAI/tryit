/** @jsxImportSource solid-js */
import { createMemo, createSignal, For, Show } from 'solid-js'
import { BoardFinish, createBoardFinish, type DailyBoardProps } from '@/games/shared/solid/finish'
import { createTranslator } from '@/lib/i18n/translate'
import { parseNumberPathClientPayload } from './parse-client'
import { visitCell } from './path-moves'
import { type Cell, cellKey, isSolved, type NumberPathPuzzleData } from './types'

export default function PathBoard(props: DailyBoardProps) {
	const t = createTranslator(props.locale)
	const puzzle = createMemo(() => {
		try {
			return parseNumberPathClientPayload(props.puzzle.puzzleData)
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

function Board(props: DailyBoardProps & { data: NumberPathPuzzleData }) {
	const t = createTranslator(props.locale)
	const { size, clues } = props.data
	const tiles = clues.flatMap((line, row) => line.map((clue, col) => ({ row, col, clue })))
	const buttons: HTMLButtonElement[] = []
	const finish = createBoardFinish(props, 'number-path')
	const locked = () => finish.state() !== 'playing'
	const [path, setPath] = createSignal<Cell[]>([])
	const visits = createMemo(() => new Map(path().map((cell, step) => [cellKey(cell), step + 1])))
	const points = () =>
		path()
			.map(({ row, col }) => `${col + 0.5},${row + 0.5}`)
			.join(' ')
	let pointer: { id: number; lastTile?: number } | undefined

	function visit(cell: Cell) {
		if (locked()) return
		const next = visitCell(props.data, path(), cell)
		if (next === path()) return
		setPath(next)
		if (isSolved(next, clues)) finish.finish({ path: next })
	}

	function move(event: PointerEvent, grid: HTMLDivElement) {
		if (pointer?.id !== event.pointerId || locked()) return
		const rect = grid.getBoundingClientRect()
		if (rect.width <= 0 || rect.height <= 0) return
		const col = Math.floor(((event.clientX - rect.left) / rect.width) * size)
		const row = Math.floor(((event.clientY - rect.top) / rect.height) * size)
		if (row < 0 || col < 0 || row >= size || col >= size) return
		const index = row * size + col
		if (pointer.lastTile === index) return
		pointer.lastTile = index
		visit({ row, col })
	}

	function end(event: PointerEvent) {
		if (pointer?.id === event.pointerId) pointer = undefined
	}

	return (
		<div class="mx-auto w-full max-w-[30rem] space-y-3">
			<div class="flex items-center justify-between gap-2 text-sm">
				<span class="font-semibold">{t('games.numberPath.name')}</span>
				<output class="tabular-nums" aria-live="polite">
					{path().length}/{tiles.length}
				</output>
				<a class="inline-flex min-h-11 items-center underline" href="#rules">
					{t('common.help')}
				</a>
			</div>
			<fieldset class="min-w-0" disabled={locked()} aria-label={t('games.numberPath.name')}>
				<div class="overflow-hidden rounded-xl border border-border">
					<div
						class="relative grid aspect-square touch-none select-none"
						style={{
							'grid-template-columns': `repeat(${size}, minmax(0, 1fr))`,
							'grid-template-rows': `repeat(${size}, minmax(0, 1fr))`,
						}}
						onPointerDown={(event) => {
							if (locked() || pointer || !event.isPrimary || event.button !== 0) return
							pointer = { id: event.pointerId }
							event.currentTarget.setPointerCapture(event.pointerId)
							move(event, event.currentTarget)
						}}
						onPointerMove={(event) => move(event, event.currentTarget)}
						onPointerUp={end}
						onPointerCancel={end}
						onLostPointerCapture={end}
					>
						<For each={tiles}>
							{({ row, col, clue }, index) => {
								const step = () => visits().get(cellKey({ row, col }))
								return (
									<button
										ref={(el) => {
											buttons[index()] = el
										}}
										type="button"
										class="grid min-w-0 place-items-center border border-border bg-background text-sm tabular-nums data-visited:bg-surface-muted focus-visible:z-10 focus-visible:outline-offset-[-3px] sm:text-base"
										data-visited={step() !== undefined || undefined}
										aria-pressed={step() !== undefined}
										aria-label={[
											t('common.cellRow', { index: row + 1 }),
											t('common.cellColumn', { index: col + 1 }),
											clue !== null
												? t('games.numberPath.cellClue', { number: clue })
												: step() !== undefined
													? t('games.numberPath.cellStep', { number: step() ?? 0 })
													: '',
										]
											.filter(Boolean)
											.join(', ')}
										onClick={(event) => {
											if (event.detail === 0) visit({ row, col })
										}}
										onKeyDown={(event) => {
											const next =
												event.key === 'ArrowUp' && row > 0
													? index() - size
													: event.key === 'ArrowDown' && row < size - 1
														? index() + size
														: event.key === 'ArrowLeft' && col > 0
															? index() - 1
															: event.key === 'ArrowRight' && col < size - 1
																? index() + 1
																: undefined
											if (next === undefined) return
											event.preventDefault()
											buttons[next]?.focus()
										}}
									>
										<Show when={clue ?? step()}>
											<span
												class="relative z-[2] grid size-[60%] min-w-0 place-items-center rounded-md bg-background font-semibold text-muted-foreground data-clue:bg-foreground data-clue:text-background data-end:bg-primary data-end:text-primary-foreground"
												data-clue={clue !== null || undefined}
												data-end={(step() !== undefined && step() === path().length) || undefined}
											>
												{clue ?? step()}
											</span>
										</Show>
									</button>
								)
							}}
						</For>
						<svg
							class="pointer-events-none absolute inset-0 z-[1] size-full text-foreground/65"
							viewBox={`0 0 ${size} ${size}`}
							aria-hidden="true"
						>
							<polyline
								points={points()}
								fill="none"
								stroke="currentColor"
								stroke-width="0.1"
								stroke-linejoin="round"
							/>
						</svg>
					</div>
				</div>
			</fieldset>
			<Show when={!locked()}>
				<div class="flex flex-wrap items-center gap-3">
					<button
						type="button"
						class="min-h-12 rounded-xl border border-border px-4 disabled:opacity-50"
						disabled={!path().length}
						onClick={() => setPath((steps) => steps.slice(0, -1))}
					>
						{t('games.numberPath.undo')}
					</button>
					<button
						type="button"
						class="min-h-12 rounded-xl border border-border px-4 disabled:opacity-50"
						disabled={!path().length}
						onClick={() => setPath([])}
					>
						{t('common.reset')}
					</button>
				</div>
			</Show>
			<BoardFinish finish={finish} locale={props.locale} message={t('games.numberPath.complete')} />
		</div>
	)
}
