/** @jsxImportSource solid-js */
import {
	createAsync,
	query,
	type RouteDefinition,
	useParams,
	useSearchParams,
} from '@solidjs/router'
import { HttpHeader } from '@solidjs/start'
import { createSignal, Show } from 'solid-js'
import { getRequestEvent } from 'solid-js/web'
import { defaultLocale, isValidLocale, type Locale } from '@/lib/i18n/config'
import { createTranslator } from '@/lib/i18n/translate'
import { pageMetadata } from '@/lib/seo/page-metadata'
import { localizedPath } from '@/lib/seo/urls'
import { PageMeta } from '@/shared/solid/page-meta'
import { SiteShell } from '@/shared/solid/site-shell'
import { siteShellData } from '@/shared/solid/site-shell-data'

const path = '/family/join'
const errors = [
	'invite_not_found',
	'family_full',
	'family_plan_inactive',
	'already_in_family',
	'family_owner',
] as const
const button =
	'inline-flex min-h-12 items-center justify-center rounded-2xl bg-primary px-5 font-semibold text-primary-foreground disabled:opacity-60'

const readInvite = query(async (localeParam: string) => {
	'use server'
	const request = getRequestEvent()?.request
	if (!request) throw new Error('Family invite needs a request')
	const { requestUser } = await import('@/lib/identity/request-identity')
	const { canonicalSiteOrigin } = await import('@/lib/site-origin-request')
	const { withPresentationDeadline } = await import('@/lib/presentation-document')
	const locale = isValidLocale(localeParam) ? localeParam : defaultLocale
	const t = createTranslator(locale)
	return {
		locale,
		signedIn: Boolean(await withPresentationDeadline(requestUser(request), null)),
		shell: siteShellData(locale, path, t, new Date()),
		meta: pageMetadata({
			locale,
			path,
			title: t('plus.family.joinTitle'),
			description: t('plus.family.joinBody'),
			baseUrl: canonicalSiteOrigin(request.headers),
			noindex: true,
		}),
	}
}, 'family-invite')

export const route: RouteDefinition = {
	matchFilters: { locale: isValidLocale },
	preload: ({ params }) => readInvite(params.locale ?? defaultLocale),
}

function Invite(props: { locale: Locale; code: string; signedIn: boolean }) {
	const translate = createTranslator(props.locale)
	const t = (key: string) => translate(`plus.family.${key}`)
	const [busy, setBusy] = createSignal(false)
	const [error, setError] = createSignal<{ code: string; key: (typeof errors)[number] }>()
	const signIn = () => {
		const callback = localizedPath(props.locale, `${path}?code=${encodeURIComponent(props.code)}`)
		return localizedPath(props.locale, `/sign-in?${new URLSearchParams({ callbackUrl: callback })}`)
	}
	async function join() {
		const code = props.code
		if (!code || busy()) return
		setBusy(true)
		setError(undefined)
		try {
			const { joinFamily } = await import('@/lib/connect/billing-client')
			await joinFamily(code)
			window.location.assign(localizedPath(props.locale, '/settings/subscription'))
		} catch (failure) {
			const message = failure instanceof Error ? failure.message : ''
			setError({ code, key: errors.find((key) => message.includes(key)) ?? 'invite_not_found' })
			setBusy(false)
		}
	}
	const failure = () => {
		const latest = error()
		return !props.code ? 'invite_not_found' : latest?.code === props.code ? latest.key : null
	}
	return (
		<main id="main-content" tabIndex={-1} class="page-shell flex-1 py-10">
			<div class="surface-card mx-auto max-w-lg space-y-4 p-6">
				<h1 class="font-display text-2xl">{t('joinTitle')}</h1>
				<p class="text-sm text-muted-foreground">{t('joinBody')}</p>
				<Show
					when={props.signedIn}
					fallback={
						<a class={button} href={signIn()}>
							{t('signInToJoin')}
						</a>
					}
				>
					<button
						type="button"
						class={`${button} w-full`}
						disabled={busy() || !props.code}
						onClick={join}
					>
						{t('join')}
					</button>
					<Show when={failure()}>
						{(key) => (
							<p role="alert" class="text-sm text-destructive">
								{t(`errors.${key()}`)}
							</p>
						)}
					</Show>
				</Show>
			</div>
		</main>
	)
}

export default function FamilyJoinPage() {
	const params = useParams()
	const [search] = useSearchParams()
	const code = () => (Array.isArray(search.code) ? search.code[0] : search.code) ?? ''
	const data = createAsync(() => readInvite(params.locale ?? defaultLocale), { deferStream: true })
	return (
		<>
			<HttpHeader name="Cache-Control" value="private, no-store" />
			<HttpHeader name="Referrer-Policy" value="no-referrer" />
			<Show when={data()} keyed>
				{(page) => (
					<>
						<PageMeta value={page.meta} />
						<SiteShell data={page.shell}>
							<Invite locale={page.locale} code={code()} signedIn={page.signedIn} />
						</SiteShell>
					</>
				)}
			</Show>
		</>
	)
}
