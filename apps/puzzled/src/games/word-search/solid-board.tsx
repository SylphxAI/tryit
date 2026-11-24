/** @jsxImportSource solid-js */
import { Check, RotateCcw } from 'lucide-solid'
import { createMemo, createSignal, For, onCleanup, Show } from 'solid-js'
import { puzzleThemeLabel } from '@/games/shared/puzzle-theme-label'
import { BoardFinish, createBoardFinish, type DailyBoardProps } from '@/games/shared/solid/finish'
import { createTranslator } from '@/lib/i18n/translate'
import { parseWordSearchClientPayload, type WordSearchClientData } from './parse-client'
import zhTwThemes from './puzzle-themes.zh-TW.json'
import { matchSelection } from './selection'
import type { Position } from './types'

type Line = { start: Position; end: Position }
const same = (a: Position, b: Position) => a.row === b.row && a.col === b.col

function lineCells({ start, end }: Line): Position[] {
	const dr = end.row - start.row
	const dc = end.col - start.col
	if (dr && dc && Math.abs(dr) !== Math.abs(dc)) return []
	return Array.from({ length: Math.max(Math.abs(dr), Math.abs(dc)) + 1 }, (_, i) => ({
		row: start.row + Math.sign(dr) * i,
		col: start.col + Math.sign(dc) * i,
	}))
}

export default function WordSearchBoard(props: DailyBoardProps) {
	const t = createTranslator(props.locale)
	const puzzle = createMemo(() => {
		try {
			return parseWordSearchClientPayload(props.puzzle.puzzleData)
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

function Board(props: DailyBoardProps & { data: WordSearchClientData }) {
	const t = createTranslator(props.locale)
	const { grid, words, theme } = props.data
	const locked = () => finish.state() !== 'playing'
	const finish = createBoardFinish(props, 'word-search')
	const [found, setFound] = finish.draft.signal('found', new Map<string, Line>())
	const [anchor, setAnchor] = createSignal<Position>()
	const [preview, setPreview] = createSignal<Line>()
	const [invalid, setInvalid] = createSignal(false)
	const highlighted = createMemo(() => [...found().values()].flatMap(lineCells))
	const selected = createMemo(() => {
		const drag = preview()
		const start = anchor()
		return drag ? lineCells(drag) : start ? [start] : []
	})
	let pointer:
		| { id: number; owner: HTMLButtonElement; start: Position; dragged: boolean }
		| undefined
	let board: HTMLFieldSetElement | undefined
	let resetTouch: number | undefined
	const buttons: HTMLButtonElement[][] = grid.map(() => [])

	function find(line: Line) {
		if (locked()) return
		const match = matchSelection(grid, words, found(), line.start, line.end)
		setInvalid(match.kind === 'invalid')
		if (match.kind !== 'new') return
		const next = new Map(found()).set(match.word, line)
		setFound(next)
		if (next.size === words.length) finish.finish({ foundWords: [...next.keys()] })
	}

	function select(pos: Position) {
		if (locked()) return
		setInvalid(false)
		const start = anchor()
		if (start) {
			setAnchor(undefined)
			find({ start, end: pos })
		} else setAnchor(pos)
	}

	function cellAt(target: EventTarget | null): HTMLButtonElement | undefined {
		const cell =
			target instanceof Element
				? target.closest<HTMLButtonElement>('button[data-row][data-col]')
				: null
		return cell && board?.contains(cell) ? cell : undefined
	}
	function cellPosition(cell: HTMLButtonElement): Position {
		return { row: Number(cell.dataset.row), col: Number(cell.dataset.col) }
	}
	function pointerPosition(event: PointerEvent): Position | undefined {
		const cell = cellAt(document.elementFromPoint(event.clientX, event.clientY))
		return cell && cellPosition(cell)
	}
	function clearPointer() {
		const previous = pointer
		pointer = undefined
		if (previous?.owner.hasPointerCapture(previous.id))
			previous.owner.releasePointerCapture(previous.id)
		setPreview(undefined)
		return previous
	}
	onCleanup(clearPointer)

	function release(event: PointerEvent, commit: boolean) {
		if (pointer?.id !== event.pointerId) return
		const { start, dragged } = pointer
		const end = commit ? pointerPosition(event) : undefined
		clearPointer()
		if (!commit || locked()) return
		if (end && !dragged && same(start, end)) {
			select(end)
			return
		}
		setAnchor(undefined)
		if (end && !same(start, end)) find({ start, end })
		else setInvalid(true)
	}

	function reset() {
		if (locked()) return
		clearPointer()
		setFound(new Map())
		setAnchor(undefined)
		setInvalid(false)
	}

	return (
		<div class="mx-auto w-full max-w-sm space-y-3">
			<div class="flex items-center justify-between gap-2 text-sm">
				<span class="font-semibold">
					{puzzleThemeLabel(theme, props.locale, zhTwThemes, t('games.wordSearch.name'))}
				</span>
				<output class="tabular-nums" aria-live="polite">
					{found().size}/{words.length}
				</output>
				<button
					type="button"
					class="grid size-11 touch-manipulation place-items-center rounded-lg border border-border"
					aria-label={t('common.reset')}
					disabled={locked()}
					onPointerDown={(event) => {
						if (event.pointerType === 'touch' && event.isPrimary) resetTouch = event.pointerId
					}}
					onPointerCancel={(event) => {
						if (resetTouch === event.pointerId) resetTouch = undefined
					}}
					onPointerUp={(event) => {
						// Chromium can deliver the next tap's pointerup after a drag,
						// but suppress its click. Require a touch that began here and
						// still ends inside the button.
						if (event.pointerType !== 'touch' || resetTouch !== event.pointerId) return
						resetTouch = undefined
						if (
							event.currentTarget.contains(document.elementFromPoint(event.clientX, event.clientY))
						)
							reset()
					}}
					onClick={reset}
				>
					<RotateCcw size={16} aria-hidden="true" />
				</button>
			</div>
			{/* Capture stays with the origin cell; never intercept taps on controls outside the board. */}
			<fieldset
				ref={board}
				class="grid aspect-square w-full touch-none select-none gap-0.5 rounded-xl border border-border bg-surface-muted p-1"
				style={{ 'grid-template-columns': `repeat(${grid.length}, minmax(0, 1fr))` }}
				aria-label={t('games.wordSearch.name')}
				onPointerDown={(event) => {
					if (locked() || pointer || !event.isPrimary || event.button !== 0) return
					const owner = cellAt(event.target)
					if (!owner) return
					const start = cellPosition(owner)
					pointer = { id: event.pointerId, owner, start, dragged: false }
					setInvalid(false)
					setPreview({ start, end: start })
					owner.setPointerCapture(event.pointerId)
				}}
				onPointerMove={(event) => {
					if (!pointer || pointer.id !== event.pointerId) return
					const end = pointerPosition(event)
					if (!end || !same(pointer.start, end)) pointer.dragged = true
					setPreview(end ? { start: pointer.start, end } : undefined)
				}}
				onPointerUp={(event) => release(event, true)}
				onPointerCancel={(event) => release(event, false)}
				onLostPointerCapture={(event) => release(event, false)}
			>
				<For each={grid}>
					{(line, rowIndex) => (
						<For each={line}>
							{(letter, colIndex) => {
								const row = rowIndex()
								const col = colIndex()
								const pos = { row, col }
								return (
									<button
										ref={(el) => {
											buttons[row][col] = el
										}}
										type="button"
										class="grid min-w-0 place-items-center rounded bg-background font-display text-[clamp(.6rem,3.2vw,1rem)] font-bold text-foreground focus-visible:z-10 data-found:bg-emerald-500/25 data-selected:bg-primary data-selected:text-primary-foreground"
										data-row={row}
										data-col={col}
										data-found={highlighted().some((cell) => same(cell, pos)) || undefined}
										data-selected={selected().some((cell) => same(cell, pos)) || undefined}
										aria-label={`${letter}, ${t('common.cellRow', { index: row + 1 })}, ${t('common.cellColumn', { index: col + 1 })}`}
										aria-pressed={selected().some((cell) => same(cell, pos))}
										disabled={locked()}
										onClick={(event) => {
											if (event.detail === 0) select(pos)
										}}
										onKeyDown={(event) => {
											if (event.key === 'Escape') {
												clearPointer()
												setAnchor(undefined)
												setInvalid(false)
											}
											const next =
												event.key === 'ArrowUp'
													? buttons[row - 1]?.[col]
													: event.key === 'ArrowDown'
														? buttons[row + 1]?.[col]
														: event.key === 'ArrowLeft'
															? buttons[row][col - 1]
															: event.key === 'ArrowRight'
																? buttons[row][col + 1]
																: undefined
											if (next) {
												event.preventDefault()
												next.focus()
											}
										}}
									>
										{letter}
									</button>
								)
							}}
						</For>
					)}
				</For>
			</fieldset>
			<ul class="flex flex-wrap justify-center gap-2">
				<For each={words}>
					{(word) => (
						<li
							class="flex items-center gap-1 rounded-full bg-surface-muted px-3 py-1 text-sm data-found:bg-emerald-500/25 data-found:line-through"
							data-found={found().has(word) || undefined}
						>
							<Show when={found().has(word)}>
								<Check size={12} aria-hidden="true" />
							</Show>
							{word}
						</li>
					)}
				</For>
			</ul>
			<p role="status" class="min-h-5 text-center text-sm text-muted-foreground">
				{invalid() ? t('games.wordSearch.invalidSelection') : ''}
			</p>
			<BoardFinish finish={finish} locale={props.locale} message={t('games.wordSearch.complete')} />
		</div>
	)
}
