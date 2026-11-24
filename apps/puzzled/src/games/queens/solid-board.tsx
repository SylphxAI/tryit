/** @jsxImportSource solid-js */
import { Crown } from 'lucide-solid'
import { createMemo, createSignal, For, Show } from 'solid-js'
import { BoardFinish, createBoardFinish, type DailyBoardProps } from '@/games/shared/solid/finish'
import { createTranslator } from '@/lib/i18n/translate'
import { parseQueensClientPayload } from './parse-client'
import {
	conflictReasons,
	getConflicts,
	isSolved,
	type QueensPuzzleData,
	REGION_COLORS,
} from './types'

export default function CrownsBoard(props: DailyBoardProps) {
	const t = createTranslator(props.locale)
	const puzzle = createMemo(() => {
		try {
			return parseQueensClientPayload(props.puzzle.puzzleData)
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

function Board(props: DailyBoardProps & { data: QueensPuzzleData }) {
	const t = createTranslator(props.locale)
	const { size, regions } = props.data
	const cells = regions.flatMap((line, row) => line.map((region, col) => ({ row, col, region })))
	const empty = () => regions.map((line) => line.map(() => false))
	const [grid, setGrid] = createSignal(empty())
	const [active, setActive] = createSignal(0)
	const buttons: HTMLButtonElement[] = []
	const finish = createBoardFinish(props, 'crowns')
	const locked = () => finish.state() !== 'playing'
	const placed = createMemo(() => cells.filter(({ row, col }) => grid()[row][col]))
	const conflicts = createMemo(() => {
		const current = grid()
		return new Map(
			placed().map((cell) => [cell, getConflicts(current, regions, cell.row, cell.col)]),
		)
	})
	const reasons = createMemo(() => {
		const activeReasons = new Set([...conflicts().values()].flatMap((set) => [...set]))
		return conflictReasons.filter((reason) => activeReasons.has(reason))
	})
	function change(row: number, col: number, place: boolean) {
		if (locked() || grid()[row][col] === place) return
		const next = grid().slice()
		next[row] = [...next[row]]
		next[row][col] = place
		setGrid(next)
		if (isSolved(next, regions, size)) finish.finish({ finalGrid: next })
	}
	function onKey(event: KeyboardEvent, row: number, col: number) {
		if (locked()) return
		if (event.key === 'Backspace' || event.key === 'Delete') {
			event.preventDefault()
			change(row, col, false)
			return
		}
		if (!Object.hasOwn(arrowMoves, event.key)) return
		event.preventDefault()
		const [dr, dc] = arrowMoves[event.key as keyof typeof arrowMoves]
		const clamp = (index: number) => Math.max(0, Math.min(size - 1, index))
		buttons[clamp(row + dr) * size + clamp(col + dc)]?.focus()
	}
	return (
		<div class="mx-auto w-full max-w-[30rem] space-y-3">
			<div class="flex items-center justify-between gap-2 text-sm">
				<span class="flex items-center gap-1" role="status">
					<Crown size={16} aria-hidden="true" />
					<span class="tabular-nums">
						{placed().length}/{size}
					</span>
				</span>
				<a class="inline-flex min-h-11 items-center underline" href="#rules">
					{t('common.help')}
				</a>
			</div>
			<fieldset class="min-w-0" disabled={locked()}>
				<legend class="sr-only">{t('games.crowns.name')}</legend>
				<div
					class="grid overflow-hidden rounded-lg border-2 border-[#1a1712] dark:border-border"
					style={{ 'grid-template-columns': `repeat(${size}, minmax(0, 1fr))` }}
				>
					<For each={cells}>
						{(cell, index) => {
							const { row, col, region } = cell
							const pressed = () => grid()[row][col]
							const conflict = () => !!conflicts().get(cell)?.size
							return (
								<button
									ref={(button) => {
										buttons[index()] = button
									}}
									type="button"
									class={`relative flex aspect-square min-w-0 items-center justify-center border-r border-b border-[#1a1712]/20 text-[#1a1712] data-divider-right:border-r-2 data-divider-right:border-r-[#1a1712] data-divider-bottom:border-b-2 data-divider-bottom:border-b-[#1a1712] data-conflict:text-[#8c2018] data-conflict:ring-2 data-conflict:ring-inset data-conflict:ring-[#8c2018] focus-visible:z-10 ${REGION_COLORS[region % REGION_COLORS.length]}`}
									data-conflict={conflict() || undefined}
									data-divider-right={
										(col < size - 1 && regions[row][col + 1] !== region) || undefined
									}
									data-divider-bottom={
										(row < size - 1 && regions[row + 1][col] !== region) || undefined
									}
									aria-label={[
										t('common.cellRow', { index: row + 1 }),
										t('common.cellColumn', { index: col + 1 }),
										t('games.crowns.region', { index: region + 1 }),
									].join(', ')}
									aria-pressed={pressed()}
									aria-invalid={conflict() || undefined}
									tabIndex={active() === index() ? 0 : -1}
									onFocus={() => setActive(index())}
									onKeyDown={(event) => onKey(event, row, col)}
									onClick={() => change(row, col, !pressed())}
								>
									<span
										class="absolute top-0.5 left-0.5 text-[clamp(.45rem,1.7vw,.65rem)] leading-none"
										aria-hidden="true"
									>
										{region + 1}
									</span>
									<Show when={pressed()}>
										<Crown class="size-[55%]" aria-hidden="true" />
									</Show>
								</button>
							)
						}}
					</For>
				</div>
			</fieldset>
			<div class="flex flex-wrap items-center gap-3">
				<Show when={!locked()}>
					<button
						class="min-h-11 rounded-xl border border-border px-4 disabled:opacity-50"
						type="button"
						disabled={placed().length === 0}
						onClick={() => setGrid(empty())}
					>
						{t('common.reset')}
					</button>
				</Show>
			</div>
			<div role="status" class="text-sm font-semibold text-destructive">
				<For each={reasons()}>{(reason) => <p>{t(`games.crowns.conflicts.${reason}`)}</p>}</For>
			</div>
			<BoardFinish finish={finish} locale={props.locale} message={t('games.crowns.complete')} />
		</div>
	)
}
