/** @jsxImportSource solid-js */
import { createMemo, createSignal, For, Show } from 'solid-js'
import { BoardFinish, createBoardFinish, type DailyBoardProps } from '@/games/shared/solid/finish'
import { createTranslator } from '@/lib/i18n/translate'
import { parseNumberPathClientPayload } from './parse-client'
import { isDeadEnd, restorePath, visitCell } from './path-moves'
import {
	type Cell,
	cellKey,
	findClueCell,
	isOrthogonalNeighbor,
	isSolved,
	type NumberPathPuzzleData,
} from './types'

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
	const locked = () => finish.state() !== 'playing'
	const finish = createBoardFinish(props, 'number-path')
	const [path, setPath] = finish.draft.signal<Cell[]>('path', [], (saved) =>
		restorePath(props.data, saved),
	)
	const [hint, setHint] = createSignal<{ text: string; error?: true }>()
	const nextNumber = () => path().length + 1
	const nextClue = createMemo(() => findClueCell(clues, nextNumber()))
	const cue = createMemo((): { text: string; error?: true } | undefined => {
		if (locked()) return
		const head = path().at(-1)
		if (!head || path().length >= tiles.length) return hint()
		const target = nextClue()
		if (target && !isOrthogonalNeighbor(head, target)) {
			return { text: t('games.numberPath.unreachableClue', { number: nextNumber() }), error: true }
		}
		if (isDeadEnd(props.data, path())) return { text: t('games.numberPath.deadEnd'), error: true }
		return (
			hint() ?? {
				text: target
					? t('games.numberPath.nextClue', { number: nextNumber() })
					: t('games.numberPath.nextBlank', { number: nextNumber(), previous: path().length }),
			}
		)
	})
	const visits = createMemo(() => new Map(path().map((cell, step) => [cellKey(cell), step + 1])))
	const points = () =>
		path()
			.map(({ row, col }) => `${col + 0.5},${row + 0.5}`)
			.join(' ')
	let pointer: { id: number; lastTile?: number } | undefined

	function visit(cell: Cell): boolean {
		if (locked()) return false
		const result = visitCell(props.data, path(), cell)
		switch (result.kind) {
			case 'startAtOne':
				setHint({ text: t('games.numberPath.startAtOne') })
				return false
			case 'nextSquare':
				setHint({ text: t('games.numberPath.nextSquare', { number: path().length }) })
				return false
			case 'lockedClue':
				setHint({ text: t('games.numberPath.lockedClue', { number: nextNumber() }), error: true })
				return false
			case 'wrongClue':
				setHint({
					text: t('games.numberPath.wrongClue', { clue: result.clue, expected: result.expected }),
					error: true,
				})
				return false
			case 'outside':
				return false
			case 'head':
				setHint(undefined)
				return true
			case 'move':
				setHint(undefined)
				setPath(result.path)
				if (isSolved(result.path, clues)) finish.finish({ path: result.path })
				return true
		}
	}

	function tileAt(event: PointerEvent, grid: HTMLDivElement) {
		const rect = grid.getBoundingClientRect()
		if (rect.width <= 0 || rect.height <= 0) return
		const col = Math.floor(((event.clientX - rect.left) / rect.width) * size)
		const row = Math.floor(((event.clientY - rect.top) / rect.height) * size)
		if (row < 0 || col < 0 || row >= size || col >= size) return
		return { row, col }
	}

	function move(event: PointerEvent, grid: HTMLDivElement) {
		if (pointer?.id !== event.pointerId || locked()) return
		const cell = tileAt(event, grid)
		if (!cell) return
		const index = cell.row * size + cell.col
		if (pointer.lastTile === index) return
		pointer.lastTile = index
		visit(cell)
	}

	function end(event: PointerEvent) {
		if (pointer?.id === event.pointerId) pointer = undefined
	}

	return (
		<div class="play-split mx-auto w-full max-w-[30rem] space-y-3" data-number-path-board>
			<div class="play-meta flex items-center justify-between gap-2 text-sm">
				<span class="font-semibold">{t('games.numberPath.name')}</span>
				<output class="tabular-nums" aria-live="polite">
					{path().length}/{tiles.length}
				</output>
			</div>
			<fieldset
				class="play-board w-full min-w-0"
				disabled={locked()}
				aria-label={t('games.numberPath.name')}
			>
				<div class="overflow-hidden rounded-xl border border-border">
					<div
						class="relative grid aspect-square touch-none select-none"
						style={{
							'grid-template-columns': `repeat(${size}, minmax(0, 1fr))`,
							'grid-template-rows': `repeat(${size}, minmax(0, 1fr))`,
						}}
						onPointerDown={(event) => {
							if (locked() || pointer || !event.isPrimary || event.button !== 0) return
							const cell = tileAt(event, event.currentTarget)
							if (!cell || !visit(cell) || locked()) return
							pointer = { id: event.pointerId, lastTile: cell.row * size + cell.col }
							event.currentTarget.setPointerCapture(event.pointerId)
						}}
						onPointerMove={(event) => move(event, event.currentTarget)}
						onPointerUp={end}
						onPointerCancel={end}
						onLostPointerCapture={(event) => {
							if (event.target === event.currentTarget) end(event)
						}}
					>
						<For each={tiles}>
							{({ row, col, clue }, index) => {
								const step = () => visits().get(cellKey({ row, col }))
								const start = () => clue === 1 && path().length === 0
								const next = () => !locked() && path().length > 0 && clue === nextNumber()
								return (
									<button
										ref={(el) => {
											buttons[index()] = el
										}}
										type="button"
										class="grid min-w-0 place-items-center border border-border bg-background text-sm tabular-nums data-visited:bg-accent-warm-soft focus-visible:z-10 focus-visible:outline-offset-[-3px] sm:text-base"
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
												class="relative z-[2] grid size-[60%] min-w-0 place-items-center rounded-md bg-background font-semibold text-muted-foreground data-clue:not-data-start:not-data-end:bg-foreground data-clue:not-data-start:not-data-end:text-background [&:is([data-start],[data-end])]:bg-accent-warm [&:is([data-start],[data-end])]:text-on-accent [&:is([data-start],[data-end])]:inset-ring-2 [&:is([data-start],[data-end])]:inset-ring-cta-edge/40 motion-safe:data-start:animate-pulse motion-safe:data-start:[animation-iteration-count:2]"
												classList={{ 'outline-2 outline-offset-2 outline-accent-warm': next() }}
												data-clue={clue !== null || undefined}
												data-next-clue={next() || undefined}
												data-start={start() || undefined}
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
							class="pointer-events-none absolute inset-0 z-[1] size-full text-cta-edge dark:text-accent-warm"
							viewBox={`0 0 ${size} ${size}`}
							aria-hidden="true"
						>
							<polyline
								points={points()}
								fill="none"
								stroke="currentColor"
								stroke-width="0.1"
								stroke-linecap="round"
								stroke-linejoin="round"
							/>
						</svg>
					</div>
				</div>
			</fieldset>
			<div class="play-tools space-y-3" data-play-control>
				<p
					role="status"
					class="min-h-10 text-sm"
					classList={{
						'text-muted-foreground': !cue()?.error,
						'font-medium text-destructive': cue()?.error,
					}}
				>
					{cue()?.text}
				</p>
				<Show when={!locked()}>
					<div class="flex flex-wrap items-center gap-3">
						<button
							type="button"
							class="min-h-12 rounded-xl border border-border px-4 disabled:opacity-50"
							disabled={!path().length}
							onClick={() => {
								setHint(undefined)
								setPath((steps) => steps.slice(0, -1))
							}}
						>
							{t('games.numberPath.undo')}
						</button>
						<button
							type="button"
							class="min-h-12 rounded-xl border border-border px-4 disabled:opacity-50"
							disabled={!path().length}
							onClick={() => {
								setHint(undefined)
								setPath([])
							}}
						>
							{t('common.reset')}
						</button>
					</div>
				</Show>
			</div>
			<BoardFinish finish={finish} locale={props.locale} message={t('games.numberPath.complete')} />
		</div>
	)
}
