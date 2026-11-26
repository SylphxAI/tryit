/** @jsxImportSource solid-js */
import type { EntryConfig } from '@sylphx/auth/client'
import { IntlMessageFormat } from 'intl-messageformat'
import { Fingerprint } from 'lucide-solid'
import { type JSX, Show } from 'solid-js'
import type { Locale } from '@/lib/i18n/config'
import { createTranslator, type Translate } from '@/lib/i18n/translate'
import { localizedPath } from '@/lib/seo/urls'
import { AuthField, AuthSubmit, FormAlert, OAuthButtons, PasswordField } from './auth-fields'
import { SignInCodeField } from './sign-in-code-field'
import { createSignInState } from './sign-in-state'

import { SignInStepNavigation } from './sign-in-step-navigation'

const POLICY_NOTICE_ID = 'sign-in-policy-notice'
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
	const state = createSignInState(props, t, v)
	const { step, busy, otp } = state
	const policy = formatSignInPolicy(props.locale, translate)
	const recipient = () => maskEmail(state.email().trim())

	const showPolicyNotice = () =>
		(step() === 'entry' &&
			(props.entry?.providers.includes('google') ||
				props.entry?.otp ||
				state.availablePasskey())) ||
		step() === 'code'

	return (
		<div class="surface-card p-5 sm:p-7">
			<h1 class="font-display text-2xl text-balance">{t('signInTitle')}</h1>
			<div class="mt-5 space-y-4">
				<Show when={step() === 'entry' && props.entry?.providers.includes('google')}>
					<OAuthButtons
						providers={['google']}
						t={t}
						disabled={busy()}
						describedBy={POLICY_NOTICE_ID}
						loadingProvider={state.googleBusy() ? 'google' : null}
						onSelect={state.selectGoogle}
					/>
				</Show>
				<Show
					when={
						step() === 'entry' &&
						!state.emailPath() &&
						!props.entry?.providers.includes('google') &&
						!state.availablePasskey()
					}
				>
					<p class="text-sm text-muted-foreground">{v('unavailable')}</p>
				</Show>
				<form class="space-y-4" method="post" onSubmit={state.submit} noValidate aria-busy={busy()}>
					<Show
						when={
							(step() === 'entry' && state.emailPath()) ||
							step() === 'recovery' ||
							step() === 'password'
						}
					>
						<AuthField
							id="email"
							label={t('email')}
							type="email"
							autocomplete="username webauthn"
							inputmode="email"
							enterkeyhint="next"
							value={state.email()}
							inputRef={state.setEmailInput}
							onFocus={state.focusEmail}
							onChange={state.updateEmail}
							readonly={busy() || step() === 'password'}
							error={state.emailError()}
							required
						/>
					</Show>
					<Show when={step() === 'code'}>
						<SignInCodeField
							v={v}
							recipient={recipient()}
							code={otp.code()}
							busy={busy()}
							expired={otp.expired()}
							inputRef={state.setProofInput}
							onCode={state.updateCode}
						/>
					</Show>
					<Show when={step() === 'password'}>
						<PasswordField
							t={t}
							id="password"
							label={t('password')}
							autocomplete="current-password"
							value={state.password()}
							inputRef={state.setProofInput}
							onChange={state.setPassword}
							readonly={busy()}
							error={state.attempted() && !state.password() ? t('passwordRequired') : undefined}
							required
						/>
					</Show>
					<Show when={step() === 'recovery-sent'}>
						<output class="block text-sm">{v('recoverySent')}</output>
					</Show>
					<FormAlert message={state.errorMessage()} />
					<Show
						when={
							(step() === 'entry' && state.emailPath()) ||
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
									? otp.remaining() > 0
									: step() === 'code' && (otp.expired() || otp.code().length !== 6)
							}
						/>
					</Show>
					<Show when={step() === 'entry' && props.entry?.otp && otp.remaining() > 0 && !busy()}>
						<p class="text-sm text-muted-foreground">
							{v('tryAgainIn', { seconds: otp.remaining() })}
						</p>
					</Show>
					<Show when={state.availablePasskey() && (step() === 'entry' || step() === 'code')}>
						<button
							type="button"
							onClick={() => void state.passkey()}
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
					<SignInStepNavigation
						state={state}
						t={t}
						v={v}
						recipient={recipient}
						passwordEnabled={props.entry?.password}
					/>
				</form>
			</div>
		</div>
	)
}

function formatSignInPolicy(locale: Locale, translate: Translate) {
	const policyRaw = translate.raw('auth.termsContinue')
	return typeof policyRaw === 'string'
		? new IntlMessageFormat(policyRaw, locale).format<JSX.Element>({
				terms: (chunks) => (
					<a
						href={localizedPath(locale, '/terms')}
						target="_blank"
						rel="noopener noreferrer"
						class="font-semibold text-foreground underline underline-offset-2"
					>
						{chunks}
					</a>
				),
				privacy: (chunks) => (
					<a
						href={localizedPath(locale, '/privacy')}
						target="_blank"
						rel="noopener noreferrer"
						class="font-semibold text-foreground underline underline-offset-2"
					>
						{chunks}
					</a>
				),
			})
		: null
}
