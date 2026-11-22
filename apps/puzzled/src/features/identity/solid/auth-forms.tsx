/** @jsxImportSource solid-js */
import { ArrowLeft, CircleCheck, TriangleAlert } from 'lucide-solid'
import { createSignal, Show } from 'solid-js'
import type { Locale } from '@/lib/i18n/config'
import { createTranslator } from '@/lib/i18n/translate'
import { MIN_PASSWORD_LENGTH, passwordProblem } from '@/lib/identity/form-validation'
import { localizedPath } from '@/lib/seo/urls'
import { AuthSubmit, FormAlert, PasswordField } from './auth-fields'
import { createIdentityAction, reset } from './form-actions'

export function ResetPasswordForm(props: { locale: Locale; challengeId: string; secret: string }) {
	const translate = createTranslator(props.locale)
	const t = (key: string, values?: Record<string, string | number>) =>
		translate(`auth.${key}`, values)
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
						href={`${localizedPath(props.locale, '/sign-in')}?recovery=1`}
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
							href={localizedPath(props.locale, '/sign-in')}
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
						href={localizedPath(props.locale, '/sign-in')}
						class="mt-6 inline-flex min-h-11 w-full items-center justify-center rounded-xl bg-primary px-4 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
					>
						{t('backToLogin')}
					</a>
				</div>
			</Show>
		</Show>
	)
}
