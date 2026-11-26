/** @jsxImportSource solid-js */
import { ArrowDown, ArrowLeft, ArrowRight, ArrowUp } from 'lucide-solid'
import { createMemo, For, onMount } from 'solid-js'
import type { Direction } from './types'

const arrows = { up: ArrowUp, left: ArrowLeft, down: ArrowDown, right: ArrowRight }
const directions = ['up', 'left', 'down', 'right'] as const

export function SlideControls(props: {
	text: (key: string) => string
	feedback?: 'blocked' | 'emptyBoard'
	canMove: (direction: Direction) => boolean | undefined
	move: (direction: Direction) => void
	canUndo: boolean
	undo: () => void
	wasReset: boolean
	reset: () => void
	giveUp: () => void
}) {
	let resetButton: HTMLButtonElement | undefined
	onMount(() => {
		if (props.wasReset) resetButton?.focus()
	})
	return (
		<>
			<p role="status" class="mt-5 text-center text-sm text-muted-foreground">
				{props.text(props.feedback ?? 'hint')}
			</p>
			<fieldset
				dir="ltr"
				class="flex min-w-0 justify-center gap-2"
				aria-label={props.text('moveControls')}
			>
				<For each={directions}>
					{(direction) => {
						const Icon = arrows[direction]
						const canMove = createMemo(() => props.canMove(direction))
						// Blocked arrows still activate so the status explains why no move occurred.
						return (
							<button
								type="button"
								class="grid size-12 place-items-center rounded-lg border border-border bg-background hover:bg-muted disabled:opacity-50 data-[can-move=true]:border-accent-warm data-[can-move=true]:bg-accent-warm-soft data-[can-move=false]:opacity-55"
								aria-label={props.text(direction)}
								data-can-move={canMove()}
								disabled={canMove() === undefined}
								onClick={() => props.move(direction)}
							>
								<Icon size={20} strokeWidth={canMove() ? 2.5 : 2} aria-hidden="true" />
							</button>
						)
					}}
				</For>
			</fieldset>
			<div class="flex flex-wrap items-center justify-center gap-x-2">
				<button
					type="button"
					class="min-h-12 rounded-xl border border-border px-3 font-semibold disabled:opacity-50"
					disabled={!props.canUndo}
					onClick={props.undo}
				>
					{props.text('undo')}
				</button>
				<button
					ref={resetButton}
					type="button"
					class="min-h-12 rounded-xl border border-border px-3 font-semibold"
					onClick={props.reset}
				>
					{props.text('reset')}
				</button>
				<button
					type="button"
					class="chrome-control min-h-12 border border-hairline px-3"
					onClick={props.giveUp}
				>
					{props.text('giveUp')}
				</button>
			</div>
		</>
	)
}
