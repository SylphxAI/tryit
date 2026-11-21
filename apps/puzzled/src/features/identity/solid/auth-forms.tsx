/** @jsxImportSource solid-js */
import { IntlMessageFormat } from 'intl-messageformat'
import { ArrowLeft, Check, CircleCheck, MailCheck, TriangleAlert } from 'lucide-solid'
import { createEffect, createSignal, For, type JSX, Show } from 'solid-js'
import type { Locale } from '@/lib/i18n/config'
import { createTranslator } from '@/lib/i18n/translate'
import { afterSignUpDestination } from '@/lib/identity/after-sign-up'
import {
	emailProblem,
	MIN_PASSWORD_LENGTH,
	passwordProblem,
	SIGN_IN_MIN_PASSWORD_LENGTH,
} from '@/lib/identity/form-validation'
import { localizedPath } from '@/lib/seo/urls'
import { AuthField, AuthSubmit, FormAlert, OAuthButtons, PasswordField } from './auth-fields'
import { createIdentityAction, recover, reset, signIn, signUp } from './form-actions'

type Props = { locale: Locale; providers: string[]; callback: string | null }
const copy = (locale: Locale) => {
	const translate = createTranslator(locale)
	return {
		t: (key: string, values?: Record<string, string | number>) => translate(`auth.${key}`, values),
		tCommon: (key: string) => translate(`common.${key}`),
	}
}
function authHref(locale: Locale, path: string, callback: string | null = null) {
	const href = localizedPath(locale, path)
	return callback ? `${href}?${new URLSearchParams({ callbackUrl: callback })}` : href
}

export function LoginForm(props: Props) {
	const { t, tCommon } = copy(props.locale)
	const action = createIdentityAction()
	const [email, setEmail] = createSignal('')
	const [password, setPassword] = createSignal('')
	const [touched, setTouched] = createSignal<{ email?: boolean; password?: boolean }>({})
	const [attempted, setAttempted] = createSignal(false)
	const destination = () => props.callback ?? localizedPath(props.locale)
	const emailIssue = () => emailProblem(email())
	const passwordIssue = () => passwordProblem(password(), SIGN_IN_MIN_PASSWORD_LENGTH)
	const emailError = () =>
		(attempted() || touched().email) && emailIssue() ? t(emailIssue()!) : undefined
	const passwordError = () =>
		(attempted() || touched().password) && passwordIssue() ? t(passwordIssue()!) : undefined
	function handleSubmit(event: SubmitEvent) {
		event.preventDefault()
		setAttempted(true)
		if (emailIssue() || passwordIssue()) return
		void action.run(() => signIn(email(), password(), destination()), 'sign_in_failed')
	}

	return (
		<div class="surface-card p-5 sm:p-7">
			<h1 class="font-display text-2xl">{t('welcomeBack')}</h1>
			<p class="mt-1.5 text-sm leading-relaxed text-muted-foreground">{t('signInToContinue')}</p>

			<div class="mt-6">
				<OAuthButtons
					t={t}
					providers={props.providers}
					onSelect={(provider) => void action.oauth(provider, destination())}
					disabled={action.pending()}
					loadingProvider={action.loadingProvider()}
				/>
			</div>

			<form method="post" onSubmit={handleSubmit} noValidate class="mt-5 space-y-4">
				<AuthField
					id="email"
					label={t('email')}
					type="email"
					value={email()}
					onChange={setEmail}
					onBlur={() => setTouched((state) => ({ ...state, email: true }))}
					autocomplete="email"
					placeholder="you@example.com"
					disabled={action.pending()}
					error={emailError()}
					required
					enterkeyhint="next"
				/>

				<PasswordField
					t={t}
					id="password"
					label={t('password')}
					value={password()}
					onChange={setPassword}
					onBlur={() => setTouched((state) => ({ ...state, password: true }))}
					autocomplete="current-password"
					disabled={action.pending()}
					error={passwordError()}
					required
					enterkeyhint="done"
				/>

				<div class="flex justify-end">
					<a
						href={authHref(props.locale, '/forgot-password')}
						class="inline-flex min-h-11 items-center rounded-lg px-1 text-sm font-semibold text-primary hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
					>
						{t('forgotPassword')}
					</a>
				</div>

				<FormAlert message={action.error() ? t('signInError') : null} />

				<AuthSubmit
					pending={action.pending()}
					pendingLabel={t('signingIn')}
					label={tCommon('signIn')}
				/>
			</form>

			<p class="mt-6 text-center text-sm text-muted-foreground">
				{t('noAccount')}{' '}
				<a
					href={authHref(props.locale, '/signup', props.callback)}
					class="inline-flex min-h-11 items-center px-1 font-semibold text-primary hover:underline"
				>
					{tCommon('signUp')}
				</a>
			</p>
		</div>
	)
}

export function SignUpForm(props: Props) {
	const { t, tCommon } = copy(props.locale)
	const action = createIdentityAction()
	const [termsAccepted, setTermsAccepted] = createSignal(false)
	const [name, setName] = createSignal('')
	const [email, writeEmail] = createSignal('')
	const setEmail = (value: string) => {
		writeEmail(value)
		action.clearError()
	}
	const [password, setPassword] = createSignal('')
	const [attempted, setAttempted] = createSignal(false)
	const [touched, setTouched] = createSignal<{
		name?: boolean
		email?: boolean
		password?: boolean
	}>({})
	const [retryEmails, setRetryEmails] = createSignal<ReadonlySet<string>>(new Set())
	const identityEmail = () => email().trim().toLowerCase()
	const retry = () => retryEmails().has(identityEmail())
	const nameIssue = () => !name().trim()
	const emailIssue = () => emailProblem(email())
	const passwordIssue = () => passwordProblem(password())
	const serverSaysTooShort = () => action.error() === 'password_too_short'
	const passwordError = () =>
		(attempted() || touched().password) && passwordIssue()
			? t(passwordIssue()!, { min: MIN_PASSWORD_LENGTH })
			: serverSaysTooShort()
				? t('passwordTooShort', { min: MIN_PASSWORD_LENGTH })
				: undefined
	const destination = () => afterSignUpDestination(props.callback ?? localizedPath(props.locale))
	const raw = createTranslator(props.locale).raw('auth.termsAgree')
	const terms = () =>
		typeof raw === 'string'
			? new IntlMessageFormat(raw, props.locale).format<JSX.Element>({
					terms: (chunks) => (
						<a href={authHref(props.locale, '/terms')} class="underline">
							{chunks}
						</a>
					),
					privacy: (chunks) => (
						<a href={authHref(props.locale, '/privacy')} class="underline">
							{chunks}
						</a>
					),
				})
			: null
	let recoveryRef: HTMLDivElement | undefined
	createEffect(() => {
		if (action.error() && retry() && !action.pending())
			recoveryRef?.scrollIntoView({ block: 'nearest', inline: 'nearest', behavior: 'instant' })
	})
	function onSubmit(event: SubmitEvent) {
		event.preventDefault()
		if (!termsAccepted()) return
		setAttempted(true)
		if (nameIssue() || emailIssue() || passwordIssue()) return
		void action.run(async () => {
			const key = identityEmail()
			if (retry()) return signIn(email(), password(), destination())
			return signUp({ email: email(), password: password(), name: name() }, destination(), () =>
				setRetryEmails((previous) => new Set([...previous, key])),
			)
		}, 'sign_up_failed')
	}

	return (
		<div class="surface-card p-5 sm:p-7">
			<h1 class="font-display text-2xl">{t('createAccount')}</h1>
			<p class="mt-1.5 text-sm leading-relaxed text-muted-foreground">{t('joinToContinue')}</p>
			{/* The desktop brand panel makes a different pitch (free, no account, midnight); on a phone the card is the whole page, so the sign-up reasons live here. */}
			<ul class="mt-3 space-y-1.5 text-sm lg:hidden">
				<For each={['signupBenefitSaved', 'signupBenefitDevices', 'signupBenefitFree'] as const}>
					{(key) => (
						<li class="flex items-center gap-2">
							<Check class="h-4 w-4 shrink-0 text-success" aria-hidden="true" />
							{t(key)}
						</li>
					)}
				</For>
			</ul>

			<div class="mt-6">
				<OAuthButtons
					t={t}
					providers={props.providers}
					onSelect={(provider) => {
						if (termsAccepted()) void action.oauth(provider, destination(), true)
					}}
					disabled={action.pending() || !termsAccepted()}
					loadingProvider={action.loadingProvider()}
				/>
			</div>

			<form method="post" onSubmit={onSubmit} noValidate class="mt-5 space-y-4">
				<AuthField
					id="name"
					label={t('name')}
					value={name()}
					onChange={setName}
					onBlur={() => setTouched((state) => ({ ...state, name: true }))}
					autocomplete="name"
					placeholder={t('namePlaceholder')}
					disabled={action.pending()}
					error={(attempted() || touched().name) && nameIssue() ? t('nameRequired') : undefined}
					required
					enterkeyhint="next"
				/>
				<AuthField
					id="email"
					label={t('email')}
					type="email"
					value={email()}
					onChange={setEmail}
					onBlur={() => setTouched((state) => ({ ...state, email: true }))}
					autocomplete="email"
					placeholder="you@example.com"
					disabled={action.pending()}
					error={(attempted() || touched().email) && emailIssue() ? t(emailIssue()!) : undefined}
					required
					enterkeyhint="next"
				/>
				<PasswordField
					t={t}
					id="password"
					label={t('password')}
					value={password()}
					onChange={setPassword}
					onBlur={() => setTouched((state) => ({ ...state, password: true }))}
					autocomplete={retry() ? 'current-password' : 'new-password'}
					disabled={action.pending()}
					hint={t('passwordHint', { min: MIN_PASSWORD_LENGTH })}
					error={passwordError()}
					showStrength
					required
					enterkeyhint="done"
				/>

				<div
					ref={(element) => {
						recoveryRef = element
					}}
					class="scroll-m-4 space-y-4"
				>
					<FormAlert
						message={
							action.error() && !serverSaysTooShort()
								? t(
										action.error() === 'signup_signin_failed'
											? 'signUpSignInError'
											: retry()
												? 'signInError'
												: 'signUpError',
									)
								: null
						}
					/>

					<AuthSubmit
						pending={action.pending()}
						pendingLabel={t(retry() ? 'signingIn' : 'signingUp')}
						label={retry() ? t('retrySignIn') : tCommon('signUp')}
						disabled={Boolean(passwordIssue()) || !termsAccepted()}
					/>
				</div>

				<label
					for="signup-terms"
					class="flex min-h-12 items-start gap-3 text-sm text-muted-foreground"
				>
					<input
						id="signup-terms"
						type="checkbox"
						checked={termsAccepted()}
						onChange={(event) => setTermsAccepted(event.currentTarget.checked)}
						disabled={action.pending()}
						class="mt-1 size-5 shrink-0 accent-primary"
					/>
					<span>{terms()}</span>
				</label>
			</form>

			<p class="mt-6 text-center text-sm text-muted-foreground">
				{t('hasAccount')}{' '}
				<a
					href={authHref(props.locale, '/login', props.callback)}
					class="inline-flex min-h-11 items-center px-1 font-semibold text-primary hover:underline"
				>
					{tCommon('signIn')}
				</a>
			</p>
		</div>
	)
}

export function ForgotPasswordForm(props: { locale: Locale }) {
	const { t } = copy(props.locale)
	const action = createIdentityAction()
	const [email, setEmail] = createSignal('')
	const [success, setSuccess] = createSignal(false)
	const [touched, setTouched] = createSignal(false)
	const [attempted, setAttempted] = createSignal(false)
	const emailIssue = () => emailProblem(email())
	const emailError = () =>
		(attempted() || touched()) && emailIssue() ? t(emailIssue()!) : undefined
	function onSubmit(event: SubmitEvent) {
		event.preventDefault()
		setAttempted(true)
		if (emailIssue()) return
		void action.run(async () => {
			await recover(email())
			setSuccess(true)
		}, 'recovery_failed')
	}
	return (
		<Show
			when={success()}
			fallback={
				<div class="surface-card p-5 sm:p-7">
					<h1 class="font-display text-2xl">{t('forgotPasswordTitle')}</h1>
					<p class="mt-1.5 text-sm leading-relaxed text-muted-foreground">
						{t('forgotPasswordDescription')}
					</p>

					<form method="post" onSubmit={onSubmit} noValidate class="mt-6 space-y-4">
						<AuthField
							id="email"
							label={t('email')}
							type="email"
							value={email()}
							onChange={setEmail}
							onBlur={() => setTouched(true)}
							autocomplete="email"
							placeholder="you@example.com"
							disabled={action.pending()}
							error={emailError()}
							required
							enterkeyhint="done"
						/>

						<FormAlert message={action.error() ? t('resetError') : null} />

						<AuthSubmit
							pending={action.pending()}
							pendingLabel={t('sending')}
							label={t('sendResetLink')}
						/>
					</form>

					<a
						href={authHref(props.locale, '/login')}
						class="mt-6 inline-flex min-h-11 items-center gap-2 rounded-lg text-sm font-semibold text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
					>
						<ArrowLeft class="h-4 w-4" aria-hidden="true" />
						{t('backToLogin')}
					</a>
				</div>
			}
		>
			<div class="surface-card p-6 text-center sm:p-8">
				<span class="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-primary/10">
					<MailCheck class="h-7 w-7 text-primary" aria-hidden="true" />
				</span>
				<h1 class="mt-4 font-display text-2xl">{t('checkYourEmail')}</h1>
				<p class="mt-2 text-sm leading-relaxed text-muted-foreground">{t('resetLinkSent')}</p>
				<p class="mt-2 text-sm font-semibold">{email()}</p>
				<a
					href={authHref(props.locale, '/login')}
					class="mt-6 inline-flex min-h-11 w-full items-center justify-center rounded-xl border border-border bg-background px-4 text-sm font-semibold transition-colors hover:border-primary/40 hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
				>
					{t('backToLogin')}
				</a>
			</div>
		</Show>
	)
}

export function ResetPasswordForm(props: { locale: Locale; challengeId: string; secret: string }) {
	const { t } = copy(props.locale)
	const action = createIdentityAction()
	const [password, setPassword] = createSignal('')
	const [confirmPassword, setConfirmPassword] = createSignal('')
	const [success, setSuccess] = createSignal(false)
	const [touched, setTouched] = createSignal(false)
	const [attempted, setAttempted] = createSignal(false)
	const invalid = () =>
		!props.challengeId || !props.secret || action.error() === 'reset_link_invalid'
	const passwordIssue = () => passwordProblem(password())
	const matches = () => password() === confirmPassword()
	const mismatch = () => (confirmPassword() && !matches() ? t('passwordsDoNotMatch') : undefined)
	function onSubmit(event: SubmitEvent) {
		event.preventDefault()
		setAttempted(true)
		if (invalid() || passwordIssue() || !matches()) return
		void action.run(async () => {
			await reset(props.challengeId, props.secret, password())
			setSuccess(true)
		}, 'reset_failed')
	}
	return (
		<Show
			when={!invalid()}
			fallback={
				<div class="surface-card p-6 text-center sm:p-8">
					<span class="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-destructive/10">
						<TriangleAlert class="h-7 w-7 text-destructive" aria-hidden="true" />
					</span>
					<h1 class="mt-4 font-display text-2xl">{t('invalidResetLink')}</h1>
					<p class="mt-2 text-sm leading-relaxed text-muted-foreground">
						{t('invalidResetLinkDescription')}
					</p>
					<a
						href={authHref(props.locale, '/forgot-password')}
						class="mt-6 inline-flex min-h-11 w-full items-center justify-center rounded-xl bg-primary px-4 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
					>
						{t('requestNewLink')}
					</a>
				</div>
			}
		>
			<Show
				when={success()}
				fallback={
					<div class="surface-card p-5 sm:p-7">
						<h1 class="font-display text-2xl">{t('resetPasswordTitle')}</h1>
						<p class="mt-1.5 text-sm leading-relaxed text-muted-foreground">
							{t('resetPasswordDescription')}
						</p>

						<form method="post" onSubmit={onSubmit} noValidate class="mt-6 space-y-4">
							<PasswordField
								t={t}
								id="password"
								label={t('newPassword')}
								value={password()}
								onChange={setPassword}
								onBlur={() => setTouched(true)}
								autocomplete="new-password"
								disabled={action.pending()}
								error={
									(attempted() || touched()) && passwordIssue()
										? t(passwordIssue()!, { min: MIN_PASSWORD_LENGTH })
										: undefined
								}
								showStrength
								hint={t('passwordHint', { min: MIN_PASSWORD_LENGTH })}
								required
								enterkeyhint="next"
							/>
							<PasswordField
								t={t}
								id="confirmPassword"
								label={t('confirmPassword')}
								value={confirmPassword()}
								onChange={setConfirmPassword}
								autocomplete="new-password"
								disabled={action.pending()}
								error={mismatch()}
								required
								enterkeyhint="done"
							/>

							<FormAlert message={action.error() ? t('resetPasswordError') : null} />

							<AuthSubmit
								pending={action.pending()}
								pendingLabel={t('resetting')}
								label={t('resetPassword')}
								disabled={Boolean(passwordIssue()) || !matches()}
							/>
						</form>

						<a
							href={authHref(props.locale, '/login')}
							class="mt-6 inline-flex min-h-11 items-center gap-2 rounded-lg text-sm font-semibold text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
						>
							<ArrowLeft class="h-4 w-4" aria-hidden="true" />
							{t('backToLogin')}
						</a>
					</div>
				}
			>
				<div class="surface-card p-6 text-center sm:p-8">
					<span class="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-success/10">
						<CircleCheck class="h-7 w-7 text-success" aria-hidden="true" />
					</span>
					<h1 class="mt-4 font-display text-2xl">{t('passwordResetSuccess')}</h1>
					<p class="mt-2 text-sm leading-relaxed text-muted-foreground">
						{t('passwordResetSuccessDescription')}
					</p>
					<a
						href={authHref(props.locale, '/login')}
						class="mt-6 inline-flex min-h-11 w-full items-center justify-center rounded-xl bg-primary px-4 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
					>
						{t('backToLogin')}
					</a>
				</div>
			</Show>
		</Show>
	)
}
