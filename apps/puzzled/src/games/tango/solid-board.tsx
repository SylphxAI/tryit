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
	const locked = () => finish.state() !== 'playing'
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
				>
					<For each={cells}>
						{({ row, col, isGiven }) => {
							const value = () => grid()[row][col].value
							const invalid = () => conflicts().has(row * size + col)
							return (
								<button
									type="button"
									class="grid aspect-square min-w-0 place-items-center rounded-lg border border-border bg-background text-foreground data-given:bg-surface-muted data-given:text-muted-foreground data-invalid:border-destructive data-invalid:ring-2 data-invalid:ring-inset data-invalid:ring-destructive focus-visible:z-10"
									aria-label={[
										t('common.cellRow', { index: row + 1 }),
										t('common.cellColumn', { index: col + 1 }),
										t(`games.duo.cell.${value() ?? 'blank'}`),
									].join(', ')}
									aria-invalid={invalid() || undefined}
									data-given={isGiven || undefined}
									data-invalid={invalid() || undefined}
									aria-disabled={isGiven || undefined}
									onClick={() =>
										change(row, col, value() === null ? 'sun' : value() === 'sun' ? 'moon' : null)
									}
									onKeyDown={(event) => {
										if (event.key !== 'Delete' && event.key !== 'Backspace') return
										event.preventDefault()
										change(row, col, null)
									}}
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
