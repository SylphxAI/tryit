/** @jsxImportSource solid-js */
import { Delete } from 'lucide-solid'
import { playButton } from '@/features/catalog/solid/game-landing'

export function WordBoxEntry(props: {
	inputLabel: string
	backspaceLabel: string
	submitLabel: string
	current: string
	required: string | undefined
	playable: boolean
	setDraft: (element: HTMLInputElement) => void
	backspace: () => void
	addWord: () => Promise<void>
}) {
	return (
		<form
			data-play-control
			class="flex flex-wrap items-center justify-center gap-2"
			onSubmit={(event) => {
				event.preventDefault()
				void props.addWord()
			}}
		>
			<label class="sr-only" for="frame-current">
				{props.inputLabel}
			</label>
			<input
				id="frame-current"
				ref={props.setDraft}
				class="h-12 min-w-0 basis-40 rounded-lg border border-border bg-background px-3 text-center font-display text-xl font-bold tracking-wider"
				dir="ltr"
				value={props.current}
				placeholder={props.required ?? '_'}
				readOnly
				inputMode="none"
				disabled={!props.playable}
				aria-describedby={props.required ? 'frame-next-letter' : undefined}
			/>
			<button
				type="button"
				aria-label={props.backspaceLabel}
				class="grid size-11 place-items-center rounded-lg border border-border disabled:opacity-50"
				disabled={!props.playable || !props.current}
				onClick={props.backspace}
			>
				<Delete size={18} aria-hidden="true" />
			</button>
			<button
				type="submit"
				class={`${playButton} disabled:cursor-not-allowed disabled:opacity-50`}
				disabled={!props.playable || props.current.length < 3}
			>
				{props.submitLabel}
			</button>
		</form>
	)
}
