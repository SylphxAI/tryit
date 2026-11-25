/** @jsxImportSource solid-js */
import { createAsync, useParams, useSearchParams } from '@solidjs/router'
import { HttpHeader } from '@solidjs/start'
import { Match, Show, Switch } from 'solid-js'
import { defaultLocale } from '@/lib/i18n/config'
import { safeCallbackPath } from '@/lib/identity/after-sign-up'
import { PageMeta } from '@/shared/solid/page-meta'
import { ResetPasswordForm } from './auth-forms'
import { type AuthPageKind, getAuthPage } from './auth-route'
import { AuthShell } from './auth-shell'
import { SignInForm } from './sign-in-form'
import { VerifyEmailForm } from './verify-email-form'

function scalar(value: string | string[] | undefined): string | undefined {
	return Array.isArray(value) ? value[0] : value
}

export function AuthPage(props: { kind: AuthPageKind }) {
	const params = useParams()
	const [search] = useSearchParams()
	const callback = () =>
		safeCallbackPath(scalar(search.callbackUrl)) ?? safeCallbackPath(scalar(search.next))
	const data = createAsync(
		() => getAuthPage(params.locale ?? defaultLocale, props.kind, callback()),
		{
			deferStream: true,
		},
	)
	return (
		<>
			<HttpHeader name="Cache-Control" value="private, no-store" />
			<HttpHeader name="Referrer-Policy" value="no-referrer" />
			<Show when={data()} keyed>
				{(page) => (
					<>
						<PageMeta value={page.meta} />
						<AuthShell locale={page.locale}>
							<Switch>
								<Match when={props.kind === 'sign-in'}>
									<SignInForm
										locale={page.locale}
										entry={page.entry}
										callback={callback()}
										oauthFailed={[
											'signin',
											'cancelled',
											'use_existing',
											'acceptance_required',
											'oauth_failed',
										].includes(scalar(search.error) ?? '')}
										recovery={scalar(search.recovery) === '1'}
									/>
								</Match>
								<Match when={props.kind === 'verify-email'}>
									<VerifyEmailForm
										locale={page.locale}
										signedIn={page.signedIn}
										challengeId={scalar(search.challenge_id) ?? ''}
										secret={scalar(search.token) ?? ''}
									/>
								</Match>
								<Match when={props.kind === 'reset-password'}>
									<ResetPasswordForm
										locale={page.locale}
										challengeId={scalar(search.challenge_id) ?? ''}
										secret={scalar(search.token) ?? ''}
									/>
								</Match>
							</Switch>
						</AuthShell>
					</>
				)}
			</Show>
		</>
	)
}
