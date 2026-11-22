/** @jsxImportSource solid-js */
import { Check, Eye, EyeOff, Loader2 } from 'lucide-solid'
import { createSignal, For, type JSX, Show } from 'solid-js'
import { Dynamic } from 'solid-js/web'
import { MIN_PASSWORD_LENGTH } from '@/lib/identity/password-policy'
import { cn } from '@/lib/utils'
import { GoogleIcon, OAuthIcons } from './oauth-icons'

type T = (key: string, values?: Record<string, string | number>) => string
const PROVIDER_ICONS: Record<string, typeof GoogleIcon> = OAuthIcons

type Field = {
	id: string
	label: string
	value: string
	onChange: (value: string) => void
	onBlur?: () => void
	autocomplete: string
	type?: JSX.InputHTMLAttributes<HTMLInputElement>['type']
	placeholder?: string
	disabled?: boolean
	hint?: string
	error?: string
	enterkeyhint?: 'enter' | 'next' | 'done' | 'go'
	required?: boolean
	inputmode?: 'email'
	readonly?: boolean
	inputRef?: (input: HTMLInputElement) => void
}

function FieldInput(props: Field & { reveal?: boolean }) {
	const describedBy = () => (props.error || props.hint ? `${props.id}-feedback` : undefined)
	return (
		<>
			<input
				ref={props.inputRef}
				id={props.id}
				name={props.id}
				type={props.type ?? 'text'}
				value={props.value}
				onInput={(event) => props.onChange(event.currentTarget.value)}
				onBlur={props.onBlur}
				autocomplete={props.autocomplete}
				inputmode={props.inputmode}
				readOnly={props.readonly}
				placeholder={props.placeholder}
				disabled={props.disabled}
				enterkeyhint={props.enterkeyhint}
				required={props.required}
				aria-invalid={props.error ? 'true' : undefined}
				aria-describedby={describedBy()}
				class={cn(
					'h-12 w-full rounded-xl border border-border bg-background px-3 text-base text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-60',
					props.error && 'border-destructive',
					props.reveal && 'pr-14',
				)}
			/>
			<Show when={props.error || props.hint}>
				<p
					id={`${props.id}-feedback`}
					class={cn('mt-1.5 text-sm', props.error ? 'text-destructive' : 'text-muted-foreground')}
				>
					{props.error ?? props.hint}
				</p>
			</Show>
		</>
	)
}

export function AuthField(props: Field) {
	return (
		<div>
			<label for={props.id} class="mb-1.5 block text-sm font-semibold">
				{props.label}
			</label>
			<FieldInput {...props} />
		</div>
	)
}

export function PasswordField(props: Field & { showStrength?: boolean; t: T }) {
	const [visible, setVisible] = createSignal(false)
	return (
		<div>
			<label for={props.id} class="mb-1.5 block text-sm font-semibold">
				{props.label}
			</label>
			<div class="relative">
				<FieldInput {...props} reveal type={visible() ? 'text' : 'password'} />
				<button
					type="button"
					onClick={() => setVisible(!visible())}
					aria-pressed={visible()}
					aria-label={props.t(visible() ? 'hidePassword' : 'showPassword')}
					class="absolute right-1 top-0 flex h-12 w-12 items-center justify-center rounded-lg text-muted-foreground hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
				>
					<Show when={visible()} fallback={<Eye class="size-5" aria-hidden="true" />}>
						<EyeOff class="size-5" aria-hidden="true" />
					</Show>
				</button>
			</div>
			<Show when={props.showStrength && props.value}>
				<PasswordStrength value={props.value} t={props.t} />
			</Show>
		</div>
	)
}

/** Strength is stated in words as well as fill, never by colour alone. */
function PasswordStrength(props: { value: string; t: T }) {
	const t = props.t
	const checks = () =>
		[
			{ key: 'minLength', met: props.value.length >= MIN_PASSWORD_LENGTH },
			{ key: 'lowercase', met: /[a-z]/.test(props.value) },
			{ key: 'uppercase', met: /[A-Z]/.test(props.value) },
			{ key: 'number', met: /[0-9]/.test(props.value) },
			{ key: 'special', met: /[!@#$%^&*(),.?":{}|<>]/.test(props.value) },
		] as const
	const score = () => checks().filter((check) => check.met).length
	const labels = ['veryWeak', 'weak', 'fair', 'fair', 'strong', 'veryStrong'] as const

	return (
		<div class="mt-2 space-y-2">
			<div class="flex items-center gap-2">
				<div class="h-1.5 flex-1 overflow-hidden rounded-full bg-muted">
					<div
						class={cn(
							'h-full rounded-full transition-all',
							score() <= 1 && 'bg-destructive',
							score() > 1 && score() <= 3 && 'bg-accent-warm',
							score() >= 4 && 'bg-success',
						)}
						style={{ width: `${(score() / 5) * 100}%` }}
					/>
				</div>
				<span class="text-xs font-medium text-muted-foreground">
					{t('passwordStrength.label')}: {t(`passwordStrength.${labels[score()]}`)}
				</span>
			</div>
			<ul class="grid grid-cols-1 gap-1 text-xs sm:grid-cols-2">
				<For each={checks()}>
					{(check) => (
						<li class="flex items-center gap-1.5">
							<Check
								class={cn(
									'h-3.5 w-3.5 shrink-0',
									check.met ? 'text-success' : 'text-muted-foreground/50',
								)}
								aria-hidden="true"
							/>
							<span class={check.met ? 'text-foreground' : 'text-muted-foreground'}>
								{t(`passwordStrength.${check.key}`, { min: MIN_PASSWORD_LENGTH })}
							</span>
							<span class="sr-only">
								{check.met ? t('passwordStrength.met') : t('passwordStrength.unmet')}
							</span>
						</li>
					)}
				</For>
			</ul>
		</div>
	)
}

/**
 * Providers the app has actually configured.
 *
 * An empty list renders nothing: a sign-in button for a provider nobody can
 * use would be a promise the product cannot keep.
 */
export function OAuthButtons(props: {
	providers: readonly string[]
	onSelect: (provider: string) => void
	disabled?: boolean
	loadingProvider?: string | null
	t: T
}) {
	const t = props.t
	return (
		<Show when={props.providers.length > 0}>
			<div class="space-y-3">
				<For each={props.providers}>
					{(provider) => {
						const Icon = Object.hasOwn(PROVIDER_ICONS, provider)
							? PROVIDER_ICONS[provider]
							: GoogleIcon
						const name = provider.charAt(0).toUpperCase() + provider.slice(1)
						return (
							<button
								type="button"
								class="pressable flex h-12 w-full items-center justify-center gap-3 rounded-xl border border-border bg-background text-base font-medium hover:bg-accent disabled:opacity-60"
								onClick={() => props.onSelect(provider)}
								disabled={props.disabled}
							>
								{props.loadingProvider === provider ? (
									<Loader2 class="h-5 w-5 animate-spin" aria-hidden="true" />
								) : (
									<Dynamic component={Icon} class="h-5 w-5" aria-hidden="true" />
								)}
								{t('continueWith', { provider: name })}
							</button>
						)
					}}
				</For>
				<Divider label={t('orContinueWith')} />
			</div>
		</Show>
	)
}

export function Divider(props: { label: string }) {
	return (
		<div class="flex items-center gap-3">
			<span class="h-px flex-1 bg-border" aria-hidden="true" />
			<span class="text-xs uppercase tracking-wide text-muted-foreground">{props.label}</span>
			<span class="h-px flex-1 bg-border" aria-hidden="true" />
		</div>
	)
}

/** Form-level status: announced politely, never colour-only. */
export function FormAlert(props: { message?: string | null }) {
	return (
		<output aria-live="polite" class="block">
			{props.message ? (
				<p class="rounded-xl border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
					{props.message}
				</p>
			) : null}
		</output>
	)
}

export function AuthSubmit(props: {
	pending: boolean
	pendingLabel: string
	label: string
	disabled?: boolean
}) {
	return (
		<button
			type="submit"
			class="pressable flex h-12 w-full items-center justify-center rounded-xl bg-primary text-base font-semibold text-primary-foreground hover:bg-primary-hover disabled:opacity-60"
			disabled={props.pending || props.disabled}
		>
			{props.pending ? (
				<>
					<Loader2 class="mr-2 h-5 w-5 animate-spin" aria-hidden="true" />
					{props.pendingLabel}
				</>
			) : (
				props.label
			)}
		</button>
	)
}
