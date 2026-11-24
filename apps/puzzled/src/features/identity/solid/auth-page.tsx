/** @jsxImportSource solid-js */
import {
	createAsync,
	query,
	type RouteDefinition,
	redirect,
	useParams,
	useSearchParams,
} from '@solidjs/router'
import { HttpHeader } from '@solidjs/start'
import { Match, Show, Switch } from 'solid-js'
import { getRequestEvent } from 'solid-js/web'
import { defaultLocale, isValidLocale, locales } from '@/lib/i18n/config'
import { safeCallbackPath } from '@/lib/identity/after-sign-up'
import { localizedPath } from '@/lib/seo/urls'
import { PageMeta } from '@/shared/solid/page-meta'
import type { authPages } from './auth-data'
import { ResetPasswordForm } from './auth-forms'
import { AuthShell } from './auth-shell'
import { SignInForm } from './sign-in-form'
import { VerifyEmailForm } from './verify-email-form'

type AuthPageKind = keyof typeof authPages

const getAuthPage = query(
	async (localeParam: string, kind: AuthPageKind, callback: string | null) => {
		'use server'
		const request = getRequestEvent()?.request
		if (!request) throw new Error('Auth page requires a request')
		const locale = isValidLocale(localeParam) ? localeParam : defaultLocale
		const { requestUser } = await import('@/lib/identity/request-identity')
		const user = await requestUser(request)
		if (kind === 'sign-in' && user)
			throw redirect(safeCallbackPath(callback) ?? localizedPath(locale))
		const { readAuthPage } = await import('./auth-data')
		return { locale, signedIn: !!user, ...(await readAuthPage(locale, kind, request)) }
	},
	'auth-page',
)

export function authRoute(kind: AuthPageKind): RouteDefinition {
	return {
		matchFilters: { locale: (segment: string) => locales.some((locale) => locale === segment) },
		preload: ({ params, location }) =>
			getAuthPage(
				params.locale ?? defaultLocale,
				kind,
				returnPath(new URLSearchParams(location.search)),
			),
	}
}

function scalar(value: string | string[] | undefined): string | undefined {
	return Array.isArray(value) ? value[0] : value
}

function returnPath(search: URLSearchParams) {
	return safeCallbackPath(search.get('callbackUrl')) ?? safeCallbackPath(search.get('next'))
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
						<AuthShell
							locale={page.locale}
							freeGameSlug={page.freeGameSlug}
							freeGameName={page.freeGameName}
							playersToday={page.playersToday}
						>
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
