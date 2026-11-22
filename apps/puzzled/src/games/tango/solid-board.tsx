/** @jsxImportSource solid-js */
import { Moon, Sun } from 'lucide-solid'
import { createMemo, createSignal, For, Show } from 'solid-js'
import { BoardFinish, createBoardFinish, type DailyBoardProps } from '@/games/shared/solid/finish'
import { createTranslator } from '@/lib/i18n/translate'
import { parseTangoClientPayload } from './parse-client'
import { type CellValue, getConflicts, isSolved, type TangoPuzzleData } from './types'

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
	const [grid, setGrid] = createSignal(initial)
	const finish = createBoardFinish(props, 'duo')
	const locked = () => finish.state() !== 'playing'
	const conflicts = createMemo(
		() => new Set(getConflicts(grid()).map(({ row, col }) => row * size + col)),
	)
	const full = () => grid().every((line) => line.every((cell) => cell.value !== null))
	function change(row: number, col: number, value: CellValue) {
		const current = grid()[row][col]
		if (locked() || current.isGiven || current.value === value) return
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
				<a class="inline-flex min-h-11 items-center underline" href="#rules">
					{t('common.help')}
				</a>
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
									disabled={isGiven}
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
				<div class="flex flex-wrap items-center gap-3">
					<button
						class="min-h-11 rounded-xl border border-border px-4 disabled:opacity-50"
						type="button"
						disabled={grid() === initial}
						onClick={() => setGrid(initial)}
					>
						{t('common.reset')}
					</button>
					<Show when={conflicts().size > 0 || full()}>
						<p role="status" class="text-sm font-semibold text-destructive">
							{t('games.duo.hasConflicts')}
						</p>
					</Show>
				</div>
			</Show>
			<BoardFinish finish={finish} locale={props.locale} message={t('games.duo.complete')} />
		</div>
	)
}
