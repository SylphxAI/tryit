/** @jsxImportSource solid-js */
import { createMemo, createSignal, For, Index, Show } from 'solid-js'
import { BoardFinish, createBoardFinish, type DailyBoardProps } from '@/games/shared/solid/finish'
import { createTranslator } from '@/lib/i18n/translate'
import { triggerHaptic } from '@/shared/hooks/use-haptic'
import { createInitialState, type PipPlaceAction, pipPlaceReducer } from './board-state'
import { parsePipPlaceClientPayload } from './parse-client'
import {
	type Cell,
	cellKey,
	cellsEqual,
	type PipPlacePuzzleData,
	type PipPlaceRegion,
} from './types'

const regionColors = [
	'bg-orange-300/70 dark:bg-orange-500/40',
	'bg-sky-300/70 dark:bg-sky-500/40',
	'bg-lime-300/70 dark:bg-lime-500/40',
	'bg-violet-300/70 dark:bg-violet-500/40',
	'bg-amber-300/70 dark:bg-amber-500/40',
	'bg-rose-300/70 dark:bg-rose-500/40',
	'bg-teal-300/70 dark:bg-teal-500/40',
	'bg-fuchsia-300/70 dark:bg-fuchsia-500/40',
]

const pipPatterns = [[], [4], [0, 8], [0, 4, 8], [0, 2, 6, 8], [0, 2, 4, 6, 8], [0, 2, 3, 5, 6, 8]]
const dotPositions = Array.from({ length: 9 }, (_, index) => index)

function PipFace(props: { value: number }) {
	return (
		<Show when={props.value <= 6} fallback={<span aria-hidden="true">{props.value}</span>}>
			<span
				class="grid aspect-square w-7 max-w-4/5 grid-cols-3 grid-rows-3 place-items-center p-0.5"
				aria-hidden="true"
			>
				<For each={dotPositions}>
					{(dot) => (
						<span
							class="aspect-square w-3/4 rounded-full bg-current"
							classList={{ invisible: !pipPatterns[props.value]?.includes(dot) }}
						/>
					)}
				</For>
			</span>
		</Show>
	)
}

function badge(region: PipPlaceRegion | undefined) {
	if (region?.kind === 'sum') return region.value?.toString()
	if (region?.kind === 'equal') return region.value === null ? '=' : `=${region.value}`
	if (region?.kind === 'unequal') return '≠'
}

export default function PipPlaceBoard(props: DailyBoardProps) {
	const t = createTranslator(props.locale)
	const puzzle = createMemo(() => {
		try {
			return parsePipPlaceClientPayload(props.puzzle.puzzleData)
		} catch {
			return null
		}
	})
	return (
		<Show when={puzzle()} keyed fallback={<p role="alert">{t('daily.unavailableTitle')}</p>}>
			{(data) => <PipPlace {...props} data={data} />}
		</Show>
	)
}

function PipPlace(props: DailyBoardProps & { data: PipPlacePuzzleData }) {
	const t = createTranslator(props.locale)
	const data = props.data
	const [wrong, setWrong] = createSignal(false)
	const [board, setBoard] = createSignal(createInitialState(data))
	const finish = createBoardFinish(props, 'pip-place', {
		onRejected: () => {
			// A fully placed candidate is only a local rule check. The server can reject it.
			setBoard((state) => ({ ...state, gameStatus: 'playing', endTime: null }))
			setWrong(true)
		},
	})
	const playing = () => finish.state() === 'playing'
	const cells = data.regionOf.flatMap((row, r) => row.map((id, col) => ({ row: r, col, id })))
	const regions = new Map(data.regions.map((region) => [region.id, region]))
	const regionStarts = new Map<number, Cell>()
	const tileButtons: Record<number, HTMLButtonElement> = {}
	const cellButtons: Record<string, HTMLButtonElement> = {}
	for (const cell of cells) if (!regionStarts.has(cell.id)) regionStarts.set(cell.id, cell)

	const selectedFace = () => {
		const state = board()
		return state.selectedTrayIndex === null ? undefined : state.tray[state.selectedTrayIndex]
	}
	const placedPips = createMemo(
		() =>
			new Map(
				board().placed.flatMap((tile) => [
					[cellKey(tile.a), tile.pa] as const,
					[cellKey(tile.b), tile.pb] as const,
				]),
			),
	)
	function dispatch(action: PipPlaceAction) {
		if (!playing()) return
		const previous = board()
		const next = pipPlaceReducer(previous, action, data)
		if (previous === next) return
		setBoard(next)
		if (action.type !== 'SELECT_TRAY' || previous.tray !== next.tray) setWrong(false)
		triggerHaptic('light')
		if (next.gameStatus === 'won') finish.finish({ tiles: next.placed })
		return next
	}
	function selectTray(index: number, event: MouseEvent) {
		const next = dispatch({ type: 'SELECT_TRAY', index })
		if (next && event.detail === 0) {
			const empty = cells.find((cell) => !placedPips().has(cellKey(cell)))
			if (empty) cellButtons[cellKey(empty)]?.focus()
		}
	}
	function touchCell(cell: Cell, event: MouseEvent) {
		const previous = board()
		const next = dispatch({ type: 'TOUCH_CELL', cell })
		if (next && next.tray.length < previous.tray.length && event.detail === 0 && playing()) {
			tileButtons[0]?.focus()
		}
	}
	function move(event: KeyboardEvent, cell: Cell) {
		const offsets: Record<string, readonly [number, number]> = {
			ArrowUp: [-1, 0],
			ArrowDown: [1, 0],
			ArrowLeft: [0, -1],
			ArrowRight: [0, 1],
		}
		const offset = offsets[event.key]
		if (!offset) return
		event.preventDefault()
		cellButtons[cellKey({ row: cell.row + offset[0], col: cell.col + offset[1] })]?.focus()
	}

	return (
		<div class="mx-auto flex w-full max-w-sm flex-col gap-4" data-pip-place-board>
			<div class="flex flex-wrap items-center justify-between gap-x-3 text-sm">
				<p>{t('games.pipPlace.name')}</p>
				<a href="#rules" class="inline-flex min-h-12 items-center font-semibold underline">
					{t('games.pipPlace.howToPlay')}
				</a>
			</div>
			<Show when={playing()}>
				<div class="flex flex-wrap gap-2 text-sm">
					<button
						type="button"
						class="min-h-11 rounded-lg border border-border px-3 disabled:opacity-50"
						disabled={board().selectedTrayIndex === null}
						onClick={() => dispatch({ type: 'ROTATE' })}
					>
						{t('games.pipPlace.rotate')}
					</button>
					<button
						type="button"
						class="min-h-11 rounded-lg border border-border px-3 disabled:opacity-50"
						disabled={!board().past.length}
						onClick={() => dispatch({ type: 'UNDO' })}
					>
						{t('games.pipPlace.undo')}
					</button>
					<button
						type="button"
						class="min-h-11 rounded-lg border border-border px-3 disabled:opacity-50"
						disabled={!board().past.length && board().selectedTrayIndex === null}
						onClick={() => dispatch({ type: 'RESET' })}
					>
						{t('common.reset')}
					</button>
				</div>
			</Show>
			<fieldset
				aria-label={t('games.pipPlace.name')}
				dir="ltr"
				class="grid gap-0.5 rounded-xl border border-border bg-background p-1"
				style={{
					'aspect-ratio': `${data.cols} / ${data.rows}`,
					'grid-template-columns': `repeat(${data.cols}, minmax(0, 1fr))`,
					'grid-template-rows': `repeat(${data.rows}, minmax(0, 1fr))`,
				}}
			>
				<For each={cells}>
					{(cell) => {
						const key = cellKey(cell)
						const region = regions.get(cell.id)
						const marker = badge(region)
						const isStart = regionStarts.get(cell.id) === cell
						const pending = () => {
							const pendingCell = board().pending
							return pendingCell !== null && cellsEqual(pendingCell, cell)
						}
						const value = () =>
							placedPips().get(key) ?? (pending() ? selectedFace()?.pa : undefined)
						return (
							<button
								ref={(node) => {
									cellButtons[key] = node
								}}
								type="button"
								disabled={!playing()}
								aria-pressed={pending()}
								aria-label={[
									t('common.cellRow', { index: cell.row + 1 }),
									t('common.cellColumn', { index: cell.col + 1 }),
									marker && `${t('games.pipPlace.region')} ${cell.id + 1}: ${marker}`,
									value(),
								]
									.filter((part) => part !== undefined)
									.join(', ')}
								data-pip-cell={key}
								class={
									'relative grid place-items-center rounded-sm border border-border/70 aria-pressed:ring-2 aria-pressed:ring-primary aria-pressed:ring-offset-1 focus-visible:z-20 focus-visible:outline-2 focus-visible:outline-foreground ' +
									regionColors[cell.id % regionColors.length]
								}
								style={{ 'grid-row': String(cell.row + 1), 'grid-column': String(cell.col + 1) }}
								onClick={(event) => touchCell(cell, event)}
								onKeyDown={(event) => move(event, cell)}
							>
								<Show when={isStart && marker}>
									<span
										aria-hidden="true"
										class="absolute top-0.5 left-0.5 rounded bg-background/90 px-0.5 text-[0.625rem] font-bold leading-none"
									>
										{marker}
									</span>
								</Show>
								<Show when={value() !== undefined}>
									<PipFace value={value() ?? 0} />
								</Show>
							</button>
						)
					}}
				</For>
				<For each={board().placed}>
					{(tile) => (
						<span
							aria-hidden="true"
							class="pointer-events-none z-10 rounded-md ring-2 ring-inset ring-foreground/50"
							style={{
								'grid-row':
									Math.min(tile.a.row, tile.b.row) +
									1 +
									' / span ' +
									(tile.a.row === tile.b.row ? 1 : 2),
								'grid-column':
									Math.min(tile.a.col, tile.b.col) +
									1 +
									' / span ' +
									(tile.a.col === tile.b.col ? 1 : 2),
							}}
						/>
					)}
				</For>
			</fieldset>
			<Show when={playing()}>
				<div class="flex flex-wrap justify-center gap-2" dir="ltr">
					<Index each={board().tray}>
						{(face, index) => (
							<button
								ref={(node) => {
									tileButtons[index] = node
								}}
								type="button"
								aria-pressed={board().selectedTrayIndex === index}
								aria-label={t('games.pipPlace.tile', { a: face().pa, b: face().pb })}
								data-pip-tile={`${face().pa}-${face().pb}`}
								class="flex min-h-11 min-w-12 items-center justify-center rounded-lg border border-border bg-background px-1 shadow-sm aria-pressed:ring-2 aria-pressed:ring-primary"
								onClick={(event) => selectTray(index, event)}
							>
								<PipFace value={face().pa} />
								<span class="h-6 w-px bg-border" aria-hidden="true" />
								<PipFace value={face().pb} />
							</button>
						)}
					</Index>
				</div>
				<Show when={wrong()}>
					<p role="alert">{t('games.pipPlace.rejected')}</p>
				</Show>
				<Show when={!wrong() && board().tray.length === 0}>
					<p role="status" class="text-sm">
						{t('games.pipPlace.rejected')}
					</p>
				</Show>
			</Show>
			<BoardFinish
				finish={finish}
				locale={props.locale}
				message={t('games.pipPlace.complete')}
				shareTitle={t('games.pipPlace.name')}
			/>
		</div>
	)
}
