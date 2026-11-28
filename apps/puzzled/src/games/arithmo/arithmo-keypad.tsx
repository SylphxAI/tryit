/** @jsxImportSource solid-js */
import { CornerDownLeft, Delete } from 'lucide-solid'
import { For, Show } from 'solid-js'
import { glyph, tones } from './arithmo-display'
import type { createArithmoPlay } from './create-arithmo-play'
import type { CharStatus } from './types'

const keys = ['1234567890', '+-*/=']
const keyStyle =
	'grid min-h-12 min-w-0 place-items-center rounded-md border px-1 font-bold active:translate-y-px disabled:opacity-60'

type KeypadProps = Pick<
	ReturnType<typeof createArithmoPlay>,
	'keyboard' | 'keypadEnter' | 'inactive' | 'edit' | 'grade'
> & {
	text: (key: string) => string
	feedbackText: (tile: CharStatus) => string | undefined
}

export function ArithmoKeypad(props: KeypadProps) {
	const { keyboard, keypadEnter, inactive, edit, grade, text, feedbackText } = props
	return (
		<div
			data-arithmo-keypad
			data-play-control
			class="grid gap-1"
			dir="ltr"
			on:click={keypadEnter.rememberClick}
			on:focusout={keypadEnter.forgetFocus}
		>
			<For each={keys}>
				{(row, index) => (
					<div
						class={
							index() === 0
								? 'grid grid-cols-10 gap-1'
								: 'grid grid-cols-[1.5fr_repeat(5,minmax(0,1fr))_1.5fr] gap-1'
						}
					>
						<Show when={index() === 1}>
							<button
								type="button"
								class={`${keyStyle} bg-muted`}
								aria-label={text('keyboard.delete')}
								disabled={inactive()}
								onClick={() => edit('Backspace')}
							>
								<Delete size={20} aria-hidden="true" />
							</button>
						</Show>
						<For each={[...row]}>
							{(key) => (
								<button
									type="button"
									class={`${keyStyle} ${tones[keyboard()[key] ?? 'empty']}`}
									aria-description={feedbackText(keyboard()[key] ?? 'empty')}
									disabled={inactive()}
									onClick={() => edit(key)}
								>
									{glyph(key)}
								</button>
							)}
						</For>
						<Show when={index() === 1}>
							<button
								type="button"
								class={`${keyStyle} bg-primary text-primary-foreground`}
								aria-label={text('keyboard.enter')}
								disabled={inactive()}
								onClick={grade}
							>
								<CornerDownLeft size={20} aria-hidden="true" />
							</button>
						</Show>
					</div>
				)}
			</For>
		</div>
	)
}
