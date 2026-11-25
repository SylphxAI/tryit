/** @jsxImportSource solid-js */
import { createMemo, For, Show } from 'solid-js'
import { framePoints, framePolyline } from './frame-path'
import { getFrameSelection, type LetterBox } from './types'

const sides = [
	{ key: 'top', position: 'col-start-2 row-start-1 flex-row' },
	{ key: 'right', position: 'col-start-3 row-start-2 flex-col' },
	{ key: 'bottom', position: 'col-start-2 row-start-3 flex-row' },
	{ key: 'left', position: 'col-start-1 row-start-2 flex-col' },
] as const

export function FrameGrid(props: {
	box: LetterBox
	used: ReadonlySet<string>
	words: readonly string[]
	current: string
	required: string | undefined
	playing: boolean
	playable: boolean
	add: (letter: string) => void
}) {
	const selection = createMemo(() =>
		getFrameSelection(props.box, props.playing, props.current, props.required),
	)
	return (
		<div
			class="mx-auto grid w-full max-w-64 grid-cols-[auto_1fr_auto] grid-rows-[auto_1fr_auto] gap-1"
			dir="ltr"
		>
			<FramePath
				box={props.box}
				words={props.words}
				current={props.current}
				anchor={selection().anchor}
			/>
			<For each={sides}>
				{(side) => (
					<div class={`flex items-center justify-center gap-1 ${side.position}`}>
						<For each={props.box[side.key]}>
							{(letter) => {
								const active = () => selection().anchor === letter
								return (
									<button
										type="button"
										class="grid size-11 place-items-center rounded-full border border-border bg-background text-lg font-bold hover:bg-muted disabled:opacity-60 data-used:not-data-current:bg-primary data-used:not-data-current:text-primary-foreground data-current:border-accent-warm data-current:bg-accent-warm data-current:text-on-accent data-current:ring-2 data-current:ring-accent-warm/45 data-same-side:opacity-45 data-same-side:focus-visible:opacity-100"
										data-used={props.used.has(letter) || undefined}
										data-current={active() || undefined}
										data-same-side={(selection().lockedSide === side.key && !active()) || undefined}
										data-box-letter={letter}
										disabled={!props.playable}
										onClick={() => props.add(letter)}
									>
										{letter}
									</button>
								)
							}}
						</For>
					</div>
				)}
			</For>
		</div>
	)
}

function FramePath(props: {
	box: LetterBox
	words: readonly string[]
	current: string
	anchor: string | undefined
}) {
	const points = createMemo(() => framePoints(props.box))
	const active = () => framePolyline(props.current, points())
	const anchor = () => props.anchor && points().get(props.anchor)
	return (
		<div class="col-start-2 row-start-2 relative overflow-hidden rounded-xl border-2 border-primary bg-muted">
			<svg
				class="pointer-events-none absolute inset-0 size-full p-1.5 text-accent-warm-foreground dark:text-accent-warm"
				viewBox="0 0 100 100"
				preserveAspectRatio="none"
				aria-hidden="true"
				fill="none"
				stroke-linecap="round"
				stroke-linejoin="round"
			>
				<For each={props.words}>
					{(word) => (
						<Show when={framePolyline(word, points())}>
							{(path) => (
								<polyline
									points={path()}
									class="stroke-muted-foreground/45"
									stroke-dasharray="2 3"
									stroke-width="1.5"
								/>
							)}
						</Show>
					)}
				</For>
				<Show when={active()}>
					{(path) => <polyline points={path()} stroke="currentColor" stroke-width="2" />}
				</Show>
				<Show when={anchor()}>
					{(point) => <circle cx={point()[0]} cy={point()[1]} r="2.7" fill="currentColor" />}
				</Show>
			</svg>
		</div>
	)
}
