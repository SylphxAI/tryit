/** @jsxImportSource solid-js */
import type { EntryConfig } from '@sylphx/auth/client'
import { createSignInController } from '@sylphx/auth-solid'
import { IntlMessageFormat } from 'intl-messageformat'
import { ArrowLeft, Fingerprint } from 'lucide-solid'
import { createEffect, createSignal, type JSX, onCleanup, onMount, Show } from 'solid-js'
import type { Locale } from '@/lib/i18n/config'
import { createTranslator } from '@/lib/i18n/translate'
import { afterSignUpDestination } from '@/lib/identity/after-sign-up'
import { emailProblem } from '@/lib/identity/form-validation'
import { OAUTH_ACCEPTANCE, OAUTH_PREFIX } from '@/lib/identity/oauth-contract'
import { POLICY_ACCEPTANCE } from '@/lib/identity/policy-consent'
import { localizedPath } from '@/lib/seo/urls'
import { AuthField, AuthSubmit, FormAlert, OAuthButtons, PasswordField } from './auth-fields'
import { getPasskey, supportsPasskeys } from './browser-passkey'
import {
	createIdentityAction,
	IdentityRefusal,
	postIdentity,
	recover,
	signIn,
} from './form-actions'

type Step = 'entry' | 'code' | 'password' | 'recovery' | 'recovery-sent'
const RESEND_MS = 30_000
const POLICY_NOTICE_ID = 'sign-in-policy-notice'
const fieldClass =
	'h-12 w-full rounded-xl border border-border bg-background px-3 text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring'
const linkClass =
	'inline-flex min-h-11 items-center gap-1.5 rounded-md px-1 text-sm font-semibold text-foreground underline underline-offset-2 focus-visible:ring-2 focus-visible:ring-ring disabled:no-underline disabled:text-muted-foreground'
const optionClass =
	'flex h-12 w-full items-center justify-center gap-2 rounded-xl border border-border bg-background px-3 font-semibold hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-60'

function maskEmail(email: string) {
	const at = email.lastIndexOf('@')
	return `${Array.from(email.slice(0, at))[0]}•••${email.slice(at)}`
}

export function SignInForm(props: {
	locale: Locale
	entry: EntryConfig | null
	callback: string | null
	oauthFailed: boolean
	recovery: boolean
}) {
	const translate = createTranslator(props.locale)
	const t = (key: string, values?: Record<string, string | number>) =>
		translate(`auth.${key}`, values)
	const v = (key: string, values?: Record<string, string | number>) => t(`unified.${key}`, values)
	const action = createIdentityAction()
	const [step, setStep] = createSignal<Step>(
		props.recovery && props.entry?.password && !props.entry.otp ? 'recovery' : 'entry',
	)
	const [email, setEmail] = createSignal('')
	const [password, setPassword] = createSignal('')
	const [emailFocused, setEmailFocused] = createSignal(false)
	const [attempted, setAttempted] = createSignal(false)
	const [availablePasskey, setAvailablePasskey] = createSignal(false)
	const [initialError, setInitialError] = createSignal(props.oauthFailed)
	const [code, setCode] = createSignal('')
	const [flow, setFlow] = createSignal('')
	const [clock, setClock] = createSignal(0)
	const [resendAt, setResendAt] = createSignal(0)
	const [expiresAt, setExpiresAt] = createSignal(0)
	const [sent, setSent] = createSignal(false)
	const legacyRecovery = () => props.entry?.password && !props.entry.otp
	const emailPath = () => props.entry?.otp || props.entry?.password
	const remaining = () => Math.max(0, Math.ceil((resendAt() - clock()) / 1000))
	const expired = () => !!expiresAt() && clock() >= expiresAt()
	const destination = () => props.callback ?? localizedPath(props.locale)
	let emailInput: HTMLInputElement | undefined
	let proofInput: HTMLInputElement | undefined
	let passkeyRequest: AbortController | undefined
	let navigated = false
	const [leaving, setLeaving] = createSignal(false)
	const oauth = createSignInController({
		get next() {
			return destination()
		},
		search: '',
		initialConfig: props.entry ?? {
			providers: [],
			otp: false,
			password: false,
			signup: false,
			passkey: false,
		},
		routePrefix: OAUTH_PREFIX,
		getAcceptance: () => OAUTH_ACCEPTANCE,
	})
	const busy = () => action.pending() || !!oauth.busy() || leaving()
	const emailError = () => {
		const problem = email().length > 320 ? 'emailInvalid' : emailProblem(email())
		return attempted() && problem ? t(problem) : undefined
	}
	const policyRaw = translate.raw('auth.termsContinue')
	const policy =
		typeof policyRaw === 'string'
			? new IntlMessageFormat(policyRaw, props.locale).format<JSX.Element>({
					terms: (chunks) => (
						<a
							href={localizedPath(props.locale, '/terms')}
							target="_blank"
							rel="noopener noreferrer"
							class="font-semibold text-foreground underline underline-offset-2"
						>
							{chunks}
						</a>
					),
					privacy: (chunks) => (
						<a
							href={localizedPath(props.locale, '/privacy')}
							target="_blank"
							rel="noopener noreferrer"
							class="font-semibold text-foreground underline underline-offset-2"
						>
							{chunks}
						</a>
					),
				})
			: null

	const showPolicyNotice = () =>
		(step() === 'entry' &&
			(props.entry?.providers.includes('google') || props.entry?.otp || availablePasskey())) ||
		step() === 'code'

	function changeStep(next: Step) {
		setAttempted(false)
		action.clearError()
		oauth.go('choose')
		setStep(next)
		queueMicrotask(() =>
			(next === 'entry' || next === 'recovery' ? emailInput : proofInput)?.focus(),
		)
	}

	function changeEmail() {
		passkeyRequest?.abort()
		setEmailFocused(false)
		setFlow('')
		setCode('')
		setPassword('')
		setExpiresAt(0)
		setSent(false)
		changeStep('entry')
	}

	async function finish(proof: object) {
		const result = await postIdentity('sign-in', { ...proof, acceptance: POLICY_ACCEPTANCE })
		if (!result.ok || result.body.signedIn !== true)
			throw new IdentityRefusal(String(result.body.error ?? 'sign_in_unavailable'))
		navigated = true
		setLeaving(true)
		window.location.assign(
			result.body.newAccount === true ? afterSignUpDestination(destination()) : destination(),
		)
	}

	async function startCode() {
		if (remaining() > 0) return
		const now = Date.now()
		setClock(now)
		// A transport error may still have sent mail: don't immediately retry it.
		setResendAt(now + RESEND_MS)
		const result = await postIdentity('sign-in', { step: 'email-start', email: email().trim() })
		if (!result.ok) {
			if (result.retryAfter && /^\d{1,8}$/.test(result.retryAfter)) {
				setResendAt(Math.max(resendAt(), Date.now() + Number(result.retryAfter) * 1000))
			}
			throw new IdentityRefusal(String(result.body.error ?? 'sign_in_unavailable'))
		}
		const { flow: nextFlow, expiresIn } = result.body
		if (typeof nextFlow !== 'string' || typeof expiresIn !== 'number')
			throw new IdentityRefusal('sign_in_unavailable')
		setFlow(nextFlow)
		setCode('')
		setClock(Date.now())
		setExpiresAt(Date.now() + expiresIn * 1000)
		setResendAt(Date.now() + RESEND_MS)
		setSent(true)
		changeStep('code')
	}

	function verifyCode() {
		if (busy() || expired() || !flow() || !/^\d{6}$/.test(code())) return
		void action.run(
			() => finish({ step: 'email-verify', flow: flow(), code: code() }),
			'sign_in_unavailable',
		)
	}

	async function passkey(conditional = false) {
		if (busy() || navigated) return
		passkeyRequest?.abort()
		const request = new AbortController()
		passkeyRequest = request
		if (conditional) {
			try {
				const proof = await getPasskey(request.signal, true)
				// Conditional mediation returns proof only after the user chooses a passkey.
				if (proof && !request.signal.aborted && !busy()) {
					setInitialError(false)
					await action.run(
						() => finish({ ...proof, step: 'passkey-verify' }),
						'passkey_unavailable',
					)
				}
			} catch {
				// Conditional autofill is optional; Continue must remain usable.
			}
			return
		}
		setInitialError(false)
		await action.run(async () => {
			const proof = await getPasskey(request.signal)
			if (!proof) throw new IdentityRefusal('passkey_unavailable')
			await finish({ ...proof, step: 'passkey-verify' })
		}, 'passkey_unavailable')
	}

	onMount(() => {
		setAvailablePasskey(!!props.entry?.passkey && supportsPasskeys())
		const tick = window.setInterval(() => setClock(Date.now()), 250)
		onCleanup(() => {
			window.clearInterval(tick)
			passkeyRequest?.abort()
		})
	})
	createEffect(() => {
		if (step() !== 'entry' || !availablePasskey() || !emailFocused()) return
		let active = true
		void PublicKeyCredential.isConditionalMediationAvailable?.()
			.then((supported) => {
				if (supported && active) void passkey(true)
			})
			.catch(() => undefined)
		onCleanup(() => {
			active = false
			passkeyRequest?.abort()
		})
	})

	function submit(event: SubmitEvent) {
		event.preventDefault()
		if (busy()) return
		setInitialError(false)
		oauth.go('choose')
		if (step() === 'code') return verifyCode()
		if (step() === 'password') {
			setAttempted(true)
			if (!props.entry?.password || !password()) return
			void action.run(() => signIn(email().trim(), password(), destination()), 'sign_in_failed')
			return
		}
		setAttempted(true)
		if (emailProblem(email()) || email().length > 320) return
		passkeyRequest?.abort()
		if (step() === 'recovery' && legacyRecovery()) {
			void action.run(async () => {
				await recover(email().trim())
				changeStep('recovery-sent')
			}, 'recovery_failed')
		} else if (step() === 'entry') {
			if (props.entry?.otp) void action.run(startCode, 'sign_in_unavailable')
			else if (!props.entry?.otp && props.entry?.password) changeStep('password')
		}
	}

	const errorMessage = () => {
		const error = action.error()
		if (initialError() || (!error && step() === 'entry' && oauth.errorCode()))
			return v('googleError')
		if (!error) return null
		if (error === 'proof_rejected') return v(step() === 'code' ? 'invalidCode' : 'passkeyError')
		if (error === 'rate_limited') return v('rateLimited')
		if (error === 'sign_in_failed') return t('signInError')
		if (error === 'recovery_failed') return t('resetError')
		if (error === 'passkey_unavailable') return v('passkeyError')
		if (error === 'mfa_required') return v('mfaRequired')
		return v('unavailable')
	}

	return (
		<div class="surface-card p-5 sm:p-7">
			<h1 class="font-display text-2xl text-balance">{t('signInTitle')}</h1>
			<p class="mt-1.5 text-sm leading-relaxed text-muted-foreground">{t('signInDescription')}</p>
			<div class="mt-5 space-y-4">
				<Show when={step() === 'entry' && props.entry?.providers.includes('google')}>
					<OAuthButtons
						providers={['google']}
						t={t}
						disabled={busy()}
						describedBy={POLICY_NOTICE_ID}
						loadingProvider={oauth.busy() ? 'google' : null}
						onSelect={() => {
							passkeyRequest?.abort()
							setInitialError(false)
							action.clearError()
							void oauth.social('google')
						}}
					/>
				</Show>
				<Show
					when={
						step() === 'entry' &&
						!emailPath() &&
						!props.entry?.providers.includes('google') &&
						!availablePasskey()
					}
				>
					<p class="text-sm text-muted-foreground">{v('unavailable')}</p>
				</Show>
				<form class="space-y-4" method="post" onSubmit={submit} noValidate aria-busy={busy()}>
					<Show
						when={
							(step() === 'entry' && emailPath()) || step() === 'recovery' || step() === 'password'
						}
					>
						<AuthField
							id="email"
							label={t('email')}
							type="email"
							autocomplete="username webauthn"
							inputmode="email"
							enterkeyhint="next"
							value={email()}
							inputRef={(el) => {
								emailInput = el
							}}
							onFocus={() => {
								if (step() === 'entry') setEmailFocused(true)
							}}
							onChange={(value) => {
								setEmail(value)
								action.clearError()
							}}
							readonly={busy() || step() === 'password'}
							error={emailError()}
							required
						/>
					</Show>
					<Show when={step() === 'code'}>
						<div>
							<label for="sign-in-code" class="mb-1.5 block text-sm font-semibold">
								{v('codeLabel')}
							</label>
							<p class="mb-2 text-sm text-muted-foreground" id="sign-in-recipient">
								{v('sentTo', { email: maskEmail(email().trim()) })}
							</p>
							<input
								ref={(el) => {
									proofInput = el
								}}
								id="sign-in-code"
								name="code"
								type="text"
								inputmode="numeric"
								autocomplete="one-time-code"
								enterkeyhint="go"
								aria-describedby="sign-in-recipient"
								class={`${fieldClass} font-mono tracking-widest`}
								readOnly={busy()}
								value={code()}
								onInput={(event) => {
									if (busy()) return
									const next = event.currentTarget.value.replace(/\D/g, '').slice(0, 6)
									event.currentTarget.value = next
									setCode(next)
									action.clearError()
									verifyCode()
								}}
							/>
						</div>
						<Show when={expired()}>
							<output class="block text-sm">{v('expired')}</output>
						</Show>
					</Show>
					<Show when={step() === 'password'}>
						<PasswordField
							t={t}
							id="password"
							label={t('password')}
							autocomplete="current-password"
							value={password()}
							inputRef={(el) => {
								proofInput = el
							}}
							onChange={setPassword}
							readonly={busy()}
							error={attempted() && !password() ? t('passwordRequired') : undefined}
							required
						/>
					</Show>
					<Show when={step() === 'recovery-sent'}>
						<output class="block text-sm">{v('recoverySent')}</output>
					</Show>
					<FormAlert message={errorMessage()} />
					<Show
						when={
							(step() === 'entry' && emailPath()) ||
							step() === 'recovery' ||
							step() === 'code' ||
							step() === 'password'
						}
					>
						<AuthSubmit
							pending={busy()}
							pendingLabel={v('working')}
							label={step() === 'recovery' ? t('sendResetLink') : v('continue')}
							describedBy={showPolicyNotice() ? POLICY_NOTICE_ID : undefined}
							disabled={
								step() === 'entry' && props.entry?.otp
									? remaining() > 0
									: step() === 'code' && (expired() || code().length !== 6)
							}
						/>
					</Show>
					<Show when={step() === 'entry' && props.entry?.otp && remaining() > 0 && !busy()}>
						<p class="text-sm text-muted-foreground">{v('tryAgainIn', { seconds: remaining() })}</p>
					</Show>
					<Show when={availablePasskey() && (step() === 'entry' || step() === 'code')}>
						<button
							type="button"
							onClick={() => void passkey()}
							class={optionClass}
							disabled={busy()}
							aria-describedby={POLICY_NOTICE_ID}
						>
							<Fingerprint class="size-5" aria-hidden="true" />
							{v('usePasskey')}
						</button>
					</Show>
					<Show when={showPolicyNotice()}>
						<p id={POLICY_NOTICE_ID} class="text-sm leading-relaxed text-muted-foreground">
							{policy}
						</p>
					</Show>
					<Show when={step() !== 'entry'}>
						<div class="flex flex-wrap items-center justify-between gap-x-2">
							<button type="button" class={linkClass} onClick={changeEmail} disabled={busy()}>
								<ArrowLeft class="size-4" aria-hidden="true" />
								{step() === 'recovery' || step() === 'recovery-sent'
									? t('backToLogin')
									: v('changeEmail')}
							</button>
							<Show when={step() === 'code'}>
								<button
									type="button"
									disabled={busy() || remaining() > 0}
									class={linkClass}
									onClick={() => void action.run(startCode, 'sign_in_unavailable')}
								>
									{remaining() > 0 ? v('resendIn', { seconds: remaining() }) : v('resend')}
								</button>
								<span class="sr-only" role="status">
									{sent() ? v('sentTo', { email: maskEmail(email().trim()) }) : ''}
								</span>
							</Show>
							<Show when={step() === 'password' && legacyRecovery()}>
								<button
									type="button"
									class={linkClass}
									onClick={() => changeStep('recovery')}
									disabled={busy()}
								>
									{t('forgotPassword')}
								</button>
							</Show>
						</div>
					</Show>
					<Show when={step() === 'code' && props.entry?.password}>
						{/* Auth deliberately doesn't expose account-level eligibility before proof. */}
						<button
							type="button"
							class={linkClass}
							onClick={() => changeStep('password')}
							disabled={busy()}
						>
							{v('usePassword')}
						</button>
					</Show>
					<Show when={step() === 'password' && !!flow()}>
						<button
							type="button"
							class={linkClass}
							onClick={() => {
								setPassword('')
								changeStep('code')
							}}
							disabled={busy()}
						>
							{v('useCode')}
						</button>
					</Show>
				</form>
			</div>
		</div>
	)
}
