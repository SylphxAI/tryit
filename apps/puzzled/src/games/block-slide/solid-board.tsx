/** @jsxImportSource solid-js */
import { createMemo, createSignal, For, Show } from 'solid-js'
import { formatTimer } from '@/games/shared/format'
import { BoardFinish, createBoardFinish, type DailyBoardProps } from '@/games/shared/solid/finish'
import { createTranslator } from '@/lib/i18n/translate'
import { createSlidePlay } from './create-slide-play'
import { parseBlockSlideClientPayload } from './parse-client'
import { SlideBlock } from './slide-block'
import { SlideControls } from './slide-controls'
import type { BlockSlidePuzzle } from './types'

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
	const { gridWidth, gridHeight, exitX, minMoves } = props.data
	const target = props.data.blocks.find((block) => block.isTarget)
	const ids = props.data.blocks.map((block) => block.id)
	const finish = createBoardFinish(props, 'block-slide')
	const play = createSlidePlay(props.data, finish)
	const moveLabel = () => t('games.blockSlide.moveCount', { count: play.moves() })

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
							play.playing() &&
							event.isPrimary &&
							event.button === 0 &&
							event.target === event.currentTarget
						)
							play.reportEmptyBoard()
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
							const block = createMemo(() => play.blocks()[index()])
							return (
								<SlideBlock
									block={block()}
									gridWidth={gridWidth}
									gridHeight={gridHeight}
									label={`${block().isTarget ? text('target') : t('games.blockSlide.block', { index: index() + 1 })}, ${t('common.cellRow', { index: block().y + 1 })}, ${t('common.cellColumn', { index: block().x + 1 })}`}
									selected={play.selected() === id}
									disabled={!play.playing()}
									onSelect={() => play.select(id)}
									onDrag={(direction) => play.move(id, direction)}
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
			<div class="play-tools space-y-2" data-play-control>
				<Show when={play.playing()}>
					<SlideControls
						text={text}
						feedback={play.feedback()}
						canMove={play.canMoveSelected}
						move={(direction) => play.move(play.selected(), direction)}
						canUndo={play.moves() > 0}
						undo={play.undo}
						wasReset={props.wasReset}
						reset={() => {
							finish.draft.discard()
							props.reset()
						}}
						giveUp={play.giveUp}
					/>
				</Show>
			</div>
			<div class="play-result" classList={{ 'mt-6': !play.playing() }}>
				<BoardFinish
					finish={finish}
					locale={props.locale}
					message={t(
						play.outcome() === 'won' ? 'gameResult.congratulations' : 'gameResult.gameOver',
					)}
					shareTitle={text('name')}
					shareText={`⏱️ ${formatTimer(play.elapsed())} • ${moveLabel()}`}
				/>
			</div>
		</div>
	)
}
