/** @jsxImportSource solid-js */
import { createSignal, Match, Show, Switch } from 'solid-js'
import type { Locale } from '@/lib/i18n/config'
import { createTranslator } from '@/lib/i18n/translate'
import { localizedPath } from '@/lib/seo/urls'
import { AuthSubmit, FormAlert } from './auth-fields'
import { createIdentityAction, IdentityRefusal, postIdentity } from './form-actions'

/** Honor issued confirmation links, but never spend a proof on page load. */
export function VerifyEmailForm(props: {
	locale: Locale
	signedIn: boolean
	challengeId: string
	secret: string
}) {
	const translate = createTranslator(props.locale)
	const t = (key: string) => translate(`auth.${key}`)
	const action = createIdentityAction()
	const tokenPresent = () => props.challengeId && props.secret
	const [confirmed, setConfirmed] = createSignal(false)
	const [resent, setResent] = createSignal(false)
	const signIn = localizedPath(props.locale, '/sign-in')
	const linkClass =
		'inline-flex min-h-11 items-center rounded-md text-sm font-semibold text-foreground underline focus-visible:ring-2 focus-visible:ring-ring'
	return (
		<div class="surface-card space-y-4 p-5 sm:p-7">
			<Switch>
				<Match when={confirmed()}>
					<h1 class="font-display text-2xl">{t('emailVerified')}</h1>
					<p class="text-sm text-muted-foreground">{t('verifiedSignInGuidance')}</p>
					<a href={`${signIn}?recovery=1`} class={linkClass}>
						{t('setNewPassword')}
					</a>
				</Match>
				<Match when={tokenPresent() && !action.error()}>
					<h1 class="font-display text-2xl">{t('confirmEmailTitle')}</h1>
					<form
						method="post"
						onSubmit={(event) => {
							event.preventDefault()
							void action.run(async () => {
								const result = await postIdentity('verify-email', {
									challengeId: props.challengeId,
									secret: props.secret,
								})
								if (!result.ok || result.body.verified !== true)
									throw new IdentityRefusal('verificationLinkInvalid')
								setConfirmed(true)
							}, 'verificationLinkInvalid')
						}}
					>
						<AuthSubmit
							label={t('confirmEmail')}
							pendingLabel={t('verifyingEmail')}
							pending={action.pending()}
						/>
					</form>
				</Match>
				<Match when={!confirmed()}>
					<h1 class="font-display text-2xl">{t('checkYourEmail')}</h1>
					<FormAlert message={action.error() ? t(action.error()!) : null} />
					<Show when={resent()}>
						<output>{t('verificationSent')}</output>
					</Show>
					<Show when={props.signedIn && !resent()}>
						<button
							type="button"
							class={linkClass}
							disabled={action.pending()}
							onClick={() =>
								void action.run(async () => {
									const result = await postIdentity('verify-email/resend', {})
									if (!result.ok) throw new IdentityRefusal('resendFailed')
									setResent(true)
								}, 'resendFailed')
							}
						>
							{t('resendEmail')}
						</button>
					</Show>
				</Match>
			</Switch>
			<a href={signIn} class={linkClass}>
				{t('backToLogin')}
			</a>
		</div>
	)
}
