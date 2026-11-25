/** @jsxImportSource solid-js */
import { createSignal, type JSX, Show } from 'solid-js'
import type { AdminMutationResult } from './admin-mutation'
import type { AdminCommand } from './admin-routes'

export type RunAdminCommand = (input: AdminCommand) => Promise<AdminMutationResult>
export const control = 'admin-btn admin-btn-secondary min-h-11'

export function AdminDialog(props: {
	title: string
	trigger: string
	close: string
	children: (close: () => void) => JSX.Element
}) {
	let dialog!: HTMLDialogElement
	const [open, setOpen] = createSignal(false)
	return (
		<>
			<button
				type="button"
				class="admin-btn admin-btn-secondary min-h-11"
				onClick={() => {
					setOpen(true)
					dialog.showModal()
				}}
			>
				{props.trigger}
			</button>
			<dialog
				ref={dialog}
				aria-label={props.title}
				class="admin-card fixed inset-0 m-auto max-h-[90dvh] w-[min(36rem,calc(100%-2rem))] max-w-none overflow-auto p-5 text-[var(--admin-text-primary)] backdrop:bg-black/50"
				onClose={() => setOpen(false)}
			>
				<div class="mb-4 flex items-center justify-between gap-4">
					<h2 class="text-lg font-semibold">{props.title}</h2>
					<button
						type="button"
						class="admin-btn admin-btn-ghost min-h-11"
						onClick={() => dialog.close()}
					>
						{props.close}
					</button>
				</div>
				<Show when={open()}>{props.children(() => dialog.close())}</Show>
			</dialog>
		</>
	)
}

function errorText(result: Exclude<AdminMutationResult, 'saved'>) {
	if (result === 'denied') return 'Access was denied. Sign in with an administrator account.'
	if (result === 'invalid') return 'Check the supplied values before submitting again.'
	return 'The change could not be confirmed. Refresh and check the current state before trying again.'
}

export function useCommand(run: RunAdminCommand, close: () => void) {
	const [pending, setPending] = createSignal(false)
	const [error, setError] = createSignal('')
	return {
		pending,
		error,
		async submit(input: AdminCommand) {
			if (pending()) return
			setPending(true)
			setError('')
			try {
				const result = await run(input)
				if (result === 'saved') close()
				else setError(errorText(result))
			} catch {
				setError(errorText('unconfirmed'))
			} finally {
				setPending(false)
			}
		},
	}
}

export function ConfirmPanel(props: {
	description: string
	label: string
	input: AdminCommand
	run: RunAdminCommand
	close: () => void
	destructive?: boolean
}) {
	const command = useCommand(props.run, props.close)
	return (
		<div class="space-y-4">
			<p>{props.description}</p>
			<button
				type="button"
				class={`admin-btn min-h-11 ${props.destructive ? 'admin-btn-danger' : 'admin-btn-primary'}`}
				disabled={command.pending()}
				onClick={() => void command.submit(props.input)}
			>
				{props.label}
			</button>
			<Show when={command.error()}>
				<p role="alert" class="text-[var(--admin-error)]">
					{command.error()}
				</p>
			</Show>
		</div>
	)
}
