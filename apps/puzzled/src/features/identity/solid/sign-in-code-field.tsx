/** @jsxImportSource solid-js */
import { Show } from 'solid-js'
import type { SignInTranslate } from './sign-in-state'

const fieldClass =
	'h-12 w-full rounded-xl border border-border bg-background px-3 text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring'

export function SignInCodeField(props: {
	v: SignInTranslate
	recipient: string
	code: string
	busy: boolean
	expired: boolean
	inputRef: (el: HTMLInputElement) => void
	onCode: (value: string) => void
}) {
	return (
		<>
			<div>
				<label for="sign-in-code" class="mb-1.5 block text-sm font-semibold">
					{props.v('codeLabel')}
				</label>
				<p class="mb-2 text-sm text-muted-foreground" id="sign-in-recipient">
					{props.v('sentTo', { email: props.recipient })}
				</p>
				<input
					ref={props.inputRef}
					id="sign-in-code"
					name="code"
					type="text"
					inputmode="numeric"
					autocomplete="one-time-code"
					enterkeyhint="go"
					aria-describedby="sign-in-recipient"
					class={`${fieldClass} font-mono tracking-widest`}
					readOnly={props.busy}
					value={props.code}
					onInput={(event) => {
						if (props.busy) return
						const next = event.currentTarget.value.replace(/\D/g, '').slice(0, 6)
						event.currentTarget.value = next
						props.onCode(next)
					}}
				/>
			</div>
			<Show when={props.expired}>
				<output class="block text-sm">{props.v('expired')}</output>
			</Show>
		</>
	)
}
