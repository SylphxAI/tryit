/** @jsxImportSource solid-js */
import { Moon, Sun } from 'lucide-solid'
import { createMemo, createSignal, For, Show } from 'solid-js'
import { BoardFinish, createBoardFinish, type DailyBoardProps } from '@/games/shared/solid/finish'
import { createTranslator } from '@/lib/i18n/translate'
import { parseTangoClientPayload } from './parse-client'
import { type CellValue, getConflictDetails, isSolved, type TangoPuzzleData } from './types'

export default function DuoBoard(props: DailyBoardProps) {
	const t = createTranslator(props.locale)
	const puzzle = createMemo(() => {
		try {
			return parseTangoClientPayload(props.puzzle.puzzleData)
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

const arrowMoves = { ArrowUp: [-1, 0], ArrowDown: [1, 0], ArrowLeft: [0, -1], ArrowRight: [0, 1] }

function Board(props: DailyBoardProps & { data: TangoPuzzleData }) {
	const t = createTranslator(props.locale)
	const { size, initialGrid } = props.data
	const initial = initialGrid.map((line) =>
		line.map((value) => ({ value, isGiven: value !== null })),
	)
	const cells = initial.flatMap((line, row) =>
		line.map(({ isGiven }, col) => ({ row, col, isGiven })),
	)
	const finish = createBoardFinish(props, 'duo')
	const [grid, setGrid] = finish.draft.signal('grid', initial)
	const [lockedClue, setLockedClue] = createSignal(false)
	const [tabStop, setTabStop] = createSignal(0)
	const [activeCell, setActiveCell] = createSignal<number | null>(null)
	const buttons: HTMLButtonElement[] = []
	const locked = () => finish.state() !== 'playing'
	const highlightedCell = () => (locked() ? undefined : cells[activeCell() ?? -1])
	const details = createMemo(() => getConflictDetails(grid()))
	const conflicts = createMemo(
		() => new Set(details().cells.map(({ row, col }) => row * size + col)),
	)
	const lists = new Intl.ListFormat(props.locale, { type: 'conjunction' })
	const formatGroup = (group: number[]) => ({ lines: lists.format(group.map(String)) })
	function change(row: number, col: number, value: CellValue) {
		const current = grid()[row][col]
		if (locked()) return
		setLockedClue(current.isGiven)
		if (current.isGiven || current.value === value) return
		const next = grid().slice()
		next[row] = [...next[row]]
		next[row][col] = { ...current, value }
		setGrid(next)
		if (isSolved(next)) finish.finish({ grid: next.map((line) => line.map((cell) => cell.value)) })
	}
	function onKey(event: KeyboardEvent, row: number, col: number) {
		if (locked() || event.altKey || event.ctrlKey || event.metaKey || event.isComposing) return
		if (Object.hasOwn(arrowMoves, event.key)) {
			event.preventDefault()
			const [dr, dc] = arrowMoves[event.key as keyof typeof arrowMoves]
			const clamp = (index: number) => Math.max(0, Math.min(size - 1, index))
			const next = clamp(row + dr) * size + clamp(col + dc)
			buttons[next]?.focus()
			setActiveCell(next)
			return
		}
		const key = event.key.toLowerCase()
		const value = key === 's' ? 'sun' : key === 'm' ? 'moon' : undefined
		if (value === undefined && key !== 'delete' && key !== 'backspace') return
		event.preventDefault()
		setActiveCell(row * size + col)
		change(row, col, value ?? null)
	}
	return (
		<div class="mx-auto w-full max-w-[30rem] space-y-3">
			<div class="flex items-center justify-between gap-2 text-sm">
				<span class="text-muted-foreground">
					{t('games.duo.name')} ({size}×{size})
				</span>
			</div>
			<fieldset class="min-w-0" disabled={locked()}>
				<legend class="sr-only">{t('games.duo.name')}</legend>
				<div
					class="grid gap-1 rounded-xl border border-border bg-surface-muted p-1"
					style={{ 'grid-template-columns': `repeat(${size}, minmax(0, 1fr))` }}
					onPointerLeave={() => setActiveCell(null)}
					onFocusOut={(event) => {
						const next = event.relatedTarget
						if (!(next instanceof Node && event.currentTarget.contains(next))) setActiveCell(null)
					}}
				>
					<For each={cells}>
						{(cell, index) => {
							const { row, col, isGiven } = cell
							const value = () => grid()[row][col].value
							const invalid = () => conflicts().has(index())
							const crosshair = () => {
								const active = highlightedCell()
								return (
									active &&
									active !== cell &&
									(active.row === row || active.col === col) &&
									!isGiven &&
									!invalid() &&
									value() === null
								)
							}
							return (
								<button
									ref={(button) => (buttons[index()] = button)}
									type="button"
									class="grid aspect-square min-w-0 place-items-center rounded-lg border border-border bg-background text-foreground data-given:bg-surface-muted data-given:text-muted-foreground data-invalid:border-destructive data-invalid:ring-2 data-invalid:ring-inset data-invalid:ring-destructive not-data-invalid:data-active:border-accent-warm not-data-invalid:data-active:ring-2 not-data-invalid:data-active:ring-inset not-data-invalid:data-active:ring-accent-warm data-crosshair:bg-accent-warm-soft focus-visible:z-10"
									aria-label={[
										t('common.cellRow', { index: row + 1 }),
										t('common.cellColumn', { index: col + 1 }),
										t(`games.duo.cell.${value() ?? 'blank'}`),
									].join(', ')}
									aria-invalid={invalid() || undefined}
									data-given={isGiven || undefined}
									data-invalid={invalid() || undefined}
									data-active={highlightedCell() === cell || undefined}
									data-crosshair={crosshair() || undefined}
									aria-disabled={isGiven || undefined}
									tabIndex={tabStop() === index() ? 0 : -1}
									onFocus={() => {
										setTabStop(index())
										setActiveCell(index())
									}}
									onPointerEnter={(event) => {
										if (event.pointerType !== 'touch') setActiveCell(index())
									}}
									onClick={() =>
										change(row, col, value() === null ? 'sun' : value() === 'sun' ? 'moon' : null)
									}
									onKeyDown={(event) => onKey(event, row, col)}
								>
									<Show when={value() === 'sun'}>
										<Sun class="size-[55%]" aria-hidden="true" />
									</Show>
									<Show when={value() === 'moon'}>
										<Moon class="size-[55%]" aria-hidden="true" />
									</Show>
								</button>
							)
						}}
					</For>
				</div>
			</fieldset>
			<Show when={!locked()}>
				<div>
					<button
						class="min-h-11 rounded-xl border border-border px-4 disabled:opacity-50"
						type="button"
						disabled={grid() === initial}
						onClick={() => {
							setLockedClue(false)
							setGrid(initial)
						}}
					>
						{t('common.reset')}
					</button>
					<div
						role="status"
						class="space-y-1 text-sm font-semibold text-destructive [&:not(:empty)]:mt-2"
					>
						<For each={details().duplicateRows}>
							{(group) => <p>{t('games.duo.conflicts.duplicateRows', formatGroup(group))}</p>}
						</For>
						<For each={details().duplicateColumns}>
							{(group) => <p>{t('games.duo.conflicts.duplicateColumns', formatGroup(group))}</p>}
						</For>
						<Show when={details().consecutive}>
							<p>{t('games.duo.conflicts.consecutive')}</p>
						</Show>
						<Show when={details().imbalance}>
							<p>{t('games.duo.conflicts.imbalance')}</p>
						</Show>
					</div>
				</div>
			</Show>
			<div role="status" class="text-sm font-semibold">
				<Show when={lockedClue()}>
					<p>{t('games.duo.lockedClue')}</p>
				</Show>
			</div>
			<BoardFinish finish={finish} locale={props.locale} message={t('games.duo.complete')} />
		</div>
	)
}
