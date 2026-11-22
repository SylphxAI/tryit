/** @jsxImportSource solid-js */
import { ArrowDown, ArrowLeft, ArrowRight, ArrowUp } from 'lucide-solid'
import { createMemo, createSignal, For, onCleanup, onMount, Show } from 'solid-js'
import { formatTimer } from '@/games/shared/format'
import { BoardFinish, createBoardFinish, type DailyBoardProps } from '@/games/shared/solid/finish'
import { createTranslator } from '@/lib/i18n/translate'
import { triggerHaptic } from '@/shared/hooks/use-haptic'
import { parseBlockSlideClientPayload } from './parse-client'
import {
	type Block,
	type BlockSlidePuzzle,
	canMove,
	type Direction,
	isWin,
	moveBlock,
} from './types'

const arrows = { up: ArrowUp, down: ArrowDown, left: ArrowLeft, right: ArrowRight }
const directions: Direction[] = ['up', 'left', 'down', 'right']
const shortcuts: Record<string, Direction> = {
	ArrowUp: 'up',
	w: 'up',
	ArrowDown: 'down',
	s: 'down',
	ArrowLeft: 'left',
	a: 'left',
	ArrowRight: 'right',
	d: 'right',
}

export default function BlockSlideBoard(props: DailyBoardProps) {
	const t = createTranslator(props.locale)
	const puzzle = createMemo(() => {
		try {
			return parseBlockSlideClientPayload(props.puzzle.puzzleData)
		} catch {
			return null
		}
	})
	// A reset starts a fresh run and clock, but keeps the served daily puzzle identity.
	const [run, setRun] = createSignal(0)
	const board = createMemo(() => {
		const data = puzzle()
		return data ? { data, run: run() } : null
	})
	return (
		<Show when={board()} keyed fallback={<p role="alert">{t('daily.unavailableTitle')}</p>}>
			{({ data, run }) => (
				<Slides
					{...props}
					data={data}
					wasReset={run > 0}
					reset={() => setRun((value) => value + 1)}
				/>
			)}
		</Show>
	)
}

function Slides(
	props: DailyBoardProps & { data: BlockSlidePuzzle; reset: () => void; wasReset: boolean },
) {
	const t = createTranslator(props.locale)
	const text = (key: string) => t(`games.blockSlide.${key}`)
	const finish = createBoardFinish(props, 'block-slide')
	const startedAt = Date.now()
	const { gridWidth, gridHeight, exitX, exitY, minMoves } = props.data
	const target = props.data.blocks.find((block) => block.isTarget)
	const ids = props.data.blocks.map((block) => block.id)
	const [blocks, setBlocks] = createSignal(props.data.blocks)
	const [moves, setMoves] = createSignal(0)
	const [selected, setSelected] = createSignal<string>()
	const [blocked, setBlocked] = createSignal(false)
	const [outcome, setOutcome] = createSignal<'won' | 'lost'>()
	const [elapsed, setElapsed] = createSignal(0)
	const playing = () => finish.state() === 'playing' && !outcome()
	let resetButton: HTMLButtonElement | undefined

	function end(status: 'won' | 'lost', moveCount: number) {
		setElapsed(Math.max(0, Date.now() - startedAt))
		setOutcome(status)
		finish.finish({ moveCount }, { status, attempts: moveCount })
	}

	function move(id: string | undefined, direction: Direction, drag = false) {
		if (!id || !playing()) return
		const current = blocks()
		if (!canMove(current, id, direction, gridWidth, gridHeight)) {
			if (!drag) {
				setBlocked(true)
				triggerHaptic('error')
			}
			return
		}
		const next = moveBlock(current, id, direction)
		const count = moves() + 1
		setBlocked(false)
		setSelected(id)
		setBlocks(next)
		setMoves(count)
		triggerHaptic('light')
		if (isWin(next, exitX, exitY)) end('won', count)
	}

	onMount(() => {
		if (props.wasReset) resetButton?.focus()
		function onKeyDown(event: KeyboardEvent) {
			if (
				!playing() ||
				!selected() ||
				event.defaultPrevented ||
				event.isComposing ||
				event.ctrlKey ||
				event.metaKey ||
				event.altKey
			)
				return
			const target = event.target
			if (
				target instanceof HTMLElement &&
				(target.isContentEditable ||
					target.closest('input, textarea, select, [role="textbox"], dialog, [role="dialog"]'))
			)
				return
			const direction = shortcuts[event.key] ?? shortcuts[event.key.toLowerCase()]
			if (!direction) return
			event.preventDefault()
			move(selected(), direction)
		}
		window.addEventListener('keydown', onKeyDown)
		onCleanup(() => window.removeEventListener('keydown', onKeyDown))
	})

	return (
		<div class="mx-auto flex w-full max-w-sm flex-col gap-3" data-block-slide-board>
			<div class="flex flex-wrap items-center justify-between gap-2 text-sm">
				<p role="status" class="tabular-nums">
					<strong data-move-count>{moves()}</strong> {text('moves')}
					<Show when={minMoves > 0}>
						<span class="ps-3 text-muted-foreground">
							{text('minMoves')}: {minMoves}
						</span>
					</Show>
				</p>
				<a href="#rules" class="inline-flex min-h-12 items-center font-semibold underline">
					{text('howToPlay')}
				</a>
			</div>
			<fieldset dir="ltr" class="min-w-0" aria-label={text('name')}>
				<div
					class="relative w-full rounded-lg border-2 border-border bg-muted"
					style={{
						'aspect-ratio': `${gridWidth} / ${gridHeight}`,
						'background-image':
							'linear-gradient(to right, var(--color-border) 1px, transparent 1px), linear-gradient(to bottom, var(--color-border) 1px, transparent 1px)',
						'background-size': `${100 / gridWidth}% ${100 / gridHeight}%`,
					}}
				>
					<For each={ids}>
						{(id, index) => {
							const block = createMemo(() => blocks()[index()])
							return (
								<SlideBlock
									block={block()}
									gridWidth={gridWidth}
									gridHeight={gridHeight}
									label={`${block().isTarget ? text('target') : t('games.blockSlide.block', { index: index() + 1 })}, ${t('common.cellRow', { index: block().y + 1 })}, ${t('common.cellColumn', { index: block().x + 1 })}`}
									selected={selected() === id}
									disabled={!playing()}
									onSelect={() => {
										setBlocked(false)
										setSelected(selected() === id ? undefined : id)
									}}
									onDrag={(direction) => move(id, direction, true)}
								/>
							)
						}}
					</For>
					<span
						class="pointer-events-none absolute top-full mt-0.5 rounded-b-md bg-primary px-1 py-0.5 text-center text-xs font-bold text-primary-foreground"
						style={{
							left: `${(100 * exitX) / gridWidth}%`,
							width: `${(100 * (target?.width ?? 2)) / gridWidth}%`,
						}}
					>
						{text('exit')}
					</span>
				</div>
			</fieldset>
			<Show when={playing()}>
				<p class="mt-6 text-center text-sm text-muted-foreground">{text('hint')}</p>
				<fieldset
					dir="ltr"
					class="flex min-w-0 justify-center gap-2"
					aria-label={text('moveControls')}
				>
					<For each={directions}>
						{(direction) => {
							const Icon = arrows[direction]
							return (
								<button
									type="button"
									class="grid size-12 place-items-center rounded-lg border border-border bg-background hover:bg-muted disabled:opacity-50"
									aria-label={text(direction)}
									disabled={!selected()}
									onClick={() => move(selected(), direction)}
								>
									<Icon size={20} aria-hidden="true" />
								</button>
							)
						}}
					</For>
				</fieldset>
				<Show when={blocked()}>
					<p role="status" class="text-center text-sm text-muted-foreground">
						{text('blocked')}
					</p>
				</Show>
				<div class="flex items-center justify-center gap-3">
					<button
						ref={resetButton}
						type="button"
						class="min-h-12 rounded-xl border border-border px-4 font-semibold"
						onClick={props.reset}
					>
						{text('reset')}
					</button>
					<button
						type="button"
						class="min-h-12 rounded-xl px-4 font-semibold underline"
						onClick={() => end('lost', moves())}
					>
						{text('giveUp')}
					</button>
				</div>
			</Show>
			<div classList={{ 'mt-6': !playing() }}>
				<BoardFinish
					finish={finish}
					locale={props.locale}
					message={t(outcome() === 'won' ? 'gameResult.congratulations' : 'gameResult.gameOver')}
					shareTitle={text('name')}
					shareText={`⏱️ ${formatTimer(elapsed())} • ${moves()} ${text('moves')}`}
				/>
			</div>
		</div>
	)
}

function SlideBlock(props: {
	block: Block
	gridWidth: number
	gridHeight: number
	label: string
	selected: boolean
	disabled: boolean
	onSelect: () => void
	onDrag: (direction: Direction) => void
}) {
	let drag: { id: number; x: number; y: number } | undefined
	let dragged = false
	return (
		<button
			type="button"
			class="absolute grid touch-none select-none place-items-center rounded-md border-2 border-foreground/25 font-display text-xl font-extrabold text-[#1a1712] motion-safe:transition-[left,top] motion-safe:duration-100"
			classList={{
				'bg-[#ff8a6b]': props.block.isTarget,
				'bg-[#62b8f2]': !props.block.isTarget,
				'ring-2 ring-foreground ring-offset-1': props.selected,
			}}
			data-block-id={props.block.id}
			aria-label={props.label}
			aria-pressed={props.selected}
			disabled={props.disabled}
			style={{
				left: `calc(${(100 * props.block.x) / props.gridWidth}% + 2px)`,
				top: `calc(${(100 * props.block.y) / props.gridHeight}% + 2px)`,
				width: `calc(${(100 * props.block.width) / props.gridWidth}% - 4px)`,
				height: `calc(${(100 * props.block.height) / props.gridHeight}% - 4px)`,
			}}
			onPointerDown={(event) => {
				if (props.disabled || event.button !== 0 || !event.isPrimary) return
				dragged = false
				drag = { id: event.pointerId, x: event.clientX, y: event.clientY }
				event.currentTarget.setPointerCapture(event.pointerId)
			}}
			onPointerMove={(event) => {
				if (props.disabled || !drag || drag.id !== event.pointerId) return
				const dx = event.clientX - drag.x
				const dy = event.clientY - drag.y
				const threshold = (0.4 * (event.currentTarget.offsetWidth + 4)) / props.block.width
				if (Math.max(Math.abs(dx), Math.abs(dy)) <= threshold) return
				dragged = true
				drag = { id: event.pointerId, x: event.clientX, y: event.clientY }
				props.onDrag(
					Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 'right' : 'left') : dy > 0 ? 'down' : 'up',
				)
			}}
			onLostPointerCapture={(event) => {
				if (drag?.id === event.pointerId) drag = undefined
			}}
			onClick={(event) => {
				if (!dragged || event.detail === 0) props.onSelect()
			}}
		>
			<span aria-hidden="true">{props.block.isTarget ? '★' : ''}</span>
		</button>
	)
}
