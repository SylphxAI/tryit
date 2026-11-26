/** @jsxImportSource solid-js */
import { ArrowLeft } from 'lucide-solid'
import { Show } from 'solid-js'
import type { createSignInState, SignInTranslate } from './sign-in-state'

const linkClass =
	'inline-flex min-h-11 items-center gap-1.5 rounded-md px-1 text-sm font-semibold text-foreground underline underline-offset-2 focus-visible:ring-2 focus-visible:ring-ring disabled:no-underline disabled:text-muted-foreground'

export function SignInStepNavigation(props: {
	state: ReturnType<typeof createSignInState>
	t: SignInTranslate
	v: SignInTranslate
	recipient: () => string
	passwordEnabled: boolean | undefined
}) {
	const { state, t, v, recipient } = props
	const { step, busy, otp } = state
	return (
		<>
			<Show when={step() !== 'entry'}>
				<div class="flex flex-wrap items-center justify-between gap-x-2">
					<button type="button" class={linkClass} onClick={state.changeEmail} disabled={busy()}>
						<ArrowLeft class="size-4" aria-hidden="true" />
						{step() === 'recovery' || step() === 'recovery-sent'
							? t('backToLogin')
							: v('changeEmail')}
					</button>
					<Show when={step() === 'code'}>
						<button
							type="button"
							disabled={busy() || otp.remaining() > 0}
							class={linkClass}
							onClick={state.resendCode}
						>
							{otp.remaining() > 0 ? v('resendIn', { seconds: otp.remaining() }) : v('resend')}
						</button>
						<span class="sr-only" role="status">
							{otp.sent() ? v('sentTo', { email: recipient() }) : ''}
						</span>
					</Show>
					<Show when={step() === 'password' && state.legacyRecovery()}>
						<button
							type="button"
							class={linkClass}
							onClick={() => state.changeStep('recovery')}
							disabled={busy()}
						>
							{t('forgotPassword')}
						</button>
					</Show>
				</div>
			</Show>
			<Show when={step() === 'code' && props.passwordEnabled}>
				{/* Auth deliberately doesn't expose account-level eligibility before proof. */}
				<button
					type="button"
					class={linkClass}
					onClick={() => state.changeStep('password')}
					disabled={busy()}
				>
					{v('usePassword')}
				</button>
			</Show>
			<Show when={step() === 'password' && !!otp.flow()}>
				<button
					type="button"
					class={linkClass}
					onClick={() => {
						state.setPassword('')
						state.changeStep('code')
					}}
					disabled={busy()}
				>
					{v('useCode')}
				</button>
			</Show>
		</>
	)
}
