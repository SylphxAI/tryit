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
import { ForgotPasswordForm, LoginForm, ResetPasswordForm, SignUpForm } from './auth-forms'
import { AuthShell } from './auth-shell'

type AuthPageKind = keyof typeof authPages

const getAuthPage = query(async (localeParam: string, kind: AuthPageKind) => {
	'use server'
	const request = getRequestEvent()?.request
	if (!request) throw new Error('Auth page requires a request')
	const locale = isValidLocale(localeParam) ? localeParam : defaultLocale
	const { requestUser } = await import('@/lib/identity/request-identity')
	if (await requestUser(request)) throw redirect(localizedPath(locale))
	const { readAuthPage } = await import('./auth-data')
	return { locale, ...(await readAuthPage(locale, kind, request)) }
}, 'auth-page')

export function authRoute(kind: AuthPageKind): RouteDefinition {
	return {
		matchFilters: { locale: (segment: string) => locales.some((locale) => locale === segment) },
		preload: ({ params }) => getAuthPage(params.locale ?? defaultLocale, kind),
	}
}

function scalar(value: string | string[] | undefined): string | undefined {
	return Array.isArray(value) ? value[0] : value
}

export function AuthPage(props: { kind: AuthPageKind }) {
	const params = useParams()
	const [search] = useSearchParams()
	const data = createAsync(() => getAuthPage(params.locale ?? defaultLocale, props.kind), {
		deferStream: true,
	})
	const callback = () => safeCallbackPath(scalar(search.callbackUrl))
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
								<Match when={props.kind === 'login'}>
									<LoginForm
										locale={page.locale}
										providers={page.providers}
										callback={callback()}
									/>
								</Match>
								<Match when={props.kind === 'signup'}>
									<SignUpForm
										locale={page.locale}
										providers={page.providers}
										callback={callback()}
									/>
								</Match>
								<Match when={props.kind === 'forgot-password'}>
									<ForgotPasswordForm locale={page.locale} />
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
