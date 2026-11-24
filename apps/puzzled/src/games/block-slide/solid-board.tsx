/** @jsxImportSource solid-js */
import { ArrowDown, ArrowLeft, ArrowRight, ArrowUp } from 'lucide-solid'
import { createMemo, createSignal, For, onCleanup, onMount, Show } from 'solid-js'
import { formatTimer } from '@/games/shared/format'
import { BoardFinish, createBoardFinish, type DailyBoardProps } from '@/games/shared/solid/finish'
import { createTranslator } from '@/lib/i18n/translate'
import { triggerHaptic } from '@/shared/hooks/use-haptic'
import { slide, undoSlide } from './move-history'
import { parseBlockSlideClientPayload } from './parse-client'
import { type Block, type BlockSlidePuzzle, type Direction, isWin } from './types'

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
	const [history, setHistory] = createSignal([props.data.blocks])
	const blocks = () => history()[history().length - 1]
	const moves = () => history().length - 1
	const moveLabel = () => t('games.blockSlide.moveCount', { count: moves() })
	const [selected, setSelected] = createSignal<string>()
	const [feedback, setFeedback] = createSignal<'blocked' | 'emptyBoard'>()
	const [outcome, setOutcome] = createSignal<'won' | 'lost'>()
	const [elapsed, setElapsed] = createSignal(0)
	const playing = () => finish.state() === 'playing' && !outcome()
	let resetButton: HTMLButtonElement | undefined

	function end(status: 'won' | 'lost', moveCount: number) {
		setElapsed(Math.max(0, Date.now() - startedAt))
		setOutcome(status)
		finish.finish({ moveCount }, { status, attempts: moveCount })
	}

	function move(id: string | undefined, direction: Direction) {
		if (!id || !playing()) return
		setSelected(id)
		const next = slide(history(), id, direction, gridWidth, gridHeight)
		if (!next) {
			setFeedback('blocked')
			triggerHaptic('error')
			return
		}
		setFeedback(undefined)
		setHistory(next)
		triggerHaptic('light')
		if (isWin(blocks(), exitX, exitY)) end('won', moves())
	}

	function undo() {
		if (!playing()) return
		const previous = undoSlide(history())
		if (!previous) return
		setHistory(previous)
		setFeedback(undefined)
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
		<div class="play-split mx-auto flex w-full max-w-sm flex-col gap-2" data-block-slide-board>
			<div class="play-meta flex flex-wrap items-center justify-between gap-2 text-sm">
				<p role="status" class="tabular-nums">
					<strong data-move-count>{moveLabel()}</strong>
					<Show when={minMoves > 0}>
						<span class="ps-3 text-muted-foreground">
							{text('minMoves')}: {minMoves}
						</span>
					</Show>
				</p>
			</div>
			<fieldset
				dir="ltr"
				class="play-board mx-auto w-full min-w-0 max-w-[22rem]"
				aria-label={text('name')}
			>
				<div
					class="relative mx-auto w-full rounded-lg border-2 border-border bg-muted"
					onPointerUp={(event) => {
						if (
							playing() &&
							event.isPrimary &&
							event.button === 0 &&
							event.target === event.currentTarget
						)
							setFeedback('emptyBoard')
					}}
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
										setFeedback(undefined)
										setSelected(selected() === id ? undefined : id)
									}}
									onDrag={(direction) => move(id, direction)}
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
			<div class="play-tools space-y-2">
				<Show when={playing()}>
					<p role="status" class="mt-5 text-center text-sm text-muted-foreground">
						{text(feedback() ?? 'hint')}
					</p>
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
					<div class="flex flex-wrap items-center justify-center gap-x-2">
						<button
							type="button"
							class="min-h-12 rounded-xl border border-border px-3 font-semibold disabled:opacity-50"
							disabled={!moves()}
							onClick={undo}
						>
							{text('undo')}
						</button>
						<button
							ref={resetButton}
							type="button"
							class="min-h-12 rounded-xl border border-border px-3 font-semibold"
							onClick={props.reset}
						>
							{text('reset')}
						</button>
						<button
							type="button"
							class="min-h-12 rounded-xl px-3 font-semibold underline"
							onClick={() => end('lost', moves())}
						>
							{text('giveUp')}
						</button>
					</div>
				</Show>
			</div>
			<div class="play-result" classList={{ 'mt-6': !playing() }}>
				<BoardFinish
					finish={finish}
					locale={props.locale}
					message={t(outcome() === 'won' ? 'gameResult.congratulations' : 'gameResult.gameOver')}
					shareTitle={text('name')}
					shareText={`⏱️ ${formatTimer(elapsed())} • ${moveLabel()}`}
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
	function endDrag(event: PointerEvent & { currentTarget: HTMLButtonElement }) {
		if (drag?.id !== event.pointerId) return
		drag = undefined
		if (event.currentTarget.hasPointerCapture(event.pointerId))
			event.currentTarget.releasePointerCapture(event.pointerId)
	}
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
			onPointerUp={endDrag}
			onPointerCancel={endDrag}
			onLostPointerCapture={endDrag}
			onClick={(event) => {
				if (!dragged || event.detail === 0) props.onSelect()
			}}
		>
			<span aria-hidden="true">{props.block.isTarget ? '★' : ''}</span>
		</button>
	)
}
