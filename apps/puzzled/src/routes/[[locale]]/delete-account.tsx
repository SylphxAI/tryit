/** @jsxImportSource solid-js */
import { createAsync, query, type RouteDefinition, useParams } from '@solidjs/router'
import { HttpHeader } from '@solidjs/start'
import { Show } from 'solid-js'
import { getRequestEvent } from 'solid-js/web'
import { SUPPORT_EMAIL } from '@/lib/config/app'
import { defaultLocale, isValidLocale, type Locale } from '@/lib/i18n/config'
import { createTranslator } from '@/lib/i18n/translate'
import { pageMetadata } from '@/lib/seo/page-metadata'
import { localizedPath } from '@/lib/seo/urls'
import { PageMeta } from '@/shared/solid/page-meta'
import { SiteShell } from '@/shared/solid/site-shell'
import { siteShellData } from '@/shared/solid/site-shell-data'

const path = '/delete-account'
const readInstructions = query(async (localeParam: string) => {
	'use server'
	const request = getRequestEvent()?.request
	if (!request) throw new Error('Account deletion instructions need a request')
	const { canonicalSiteOrigin } = await import('@/lib/site-origin-request')
	const { requestUser } = await import('@/lib/identity/request-identity')
	const locale = isValidLocale(localeParam) ? localeParam : defaultLocale
	const t = createTranslator(locale)
	return {
		locale,
		signedIn: !!(await requestUser(request)),
		shell: siteShellData(locale, path, t, new Date()),
		meta: pageMetadata({
			locale,
			path,
			title: t('settings.deletePage.title'),
			description: t('settings.deletePage.description'),
			baseUrl: canonicalSiteOrigin(request.headers),
		}),
	}
}, 'delete-account-instructions')

export const route: RouteDefinition = {
	matchFilters: { locale: isValidLocale },
	preload: ({ params }) => readInstructions(params.locale ?? defaultLocale),
}

/** Never require a session just to find the deletion instructions. */
export default function DeleteAccountPage() {
	const params = useParams()
	const page = createAsync(() => readInstructions(params.locale ?? defaultLocale), {
		deferStream: true,
	})
	return (
		<>
			<HttpHeader name="Cache-Control" value="private, no-store" />
			<Show when={page()} keyed>
				{(data) => (
					<>
						<PageMeta value={data.meta} />
						<SiteShell data={data.shell} signedIn={data.signedIn}>
							<Instructions locale={data.locale} signedIn={data.signedIn} />
						</SiteShell>
					</>
				)}
			</Show>
		</>
	)
}

function Instructions(props: { locale: Locale; signedIn: boolean }) {
	const translate = createTranslator(props.locale)
	const t = (key: string, values?: { email: string }) => translate(`settings.${key}`, values)
	const mailto = `mailto:${SUPPORT_EMAIL}?subject=${encodeURIComponent('Tryit account deletion request')}`
	return (
		<main id="main-content" tabIndex={-1} class="page-shell-wide max-w-3xl space-y-6 py-10">
			<h1 class="font-display text-3xl font-semibold">{t('deletePage.title')}</h1>
			<p class="text-muted-foreground">{t('deletePage.description')}</p>
			<section class="space-y-4 rounded-2xl border border-border p-6">
				<h2 class="text-xl font-semibold">{t('deletePage.stepsTitle')}</h2>
				<p>{t('deletePage.steps')}</p>
				<a
					class="inline-flex min-h-11 items-center rounded-2xl bg-primary px-5 font-semibold text-primary-foreground"
					href={
						props.signedIn
							? localizedPath(props.locale, '/settings/account')
							: localizedPath(props.locale, '/sign-in?callbackUrl=%2Fsettings%2Faccount')
					}
				>
					{props.signedIn ? t('account.deleteCta') : t('deletePage.signIn')}
				</a>
				<p>{t('deletePage.erased')}</p>
				<p class="text-sm text-muted-foreground">{t('deletePage.retained')}</p>
				<a
					href={localizedPath(props.locale, '/privacy')}
					class="inline-flex min-h-11 items-center text-primary underline"
				>
					{t('deletePage.privacy')}
				</a>
			</section>
			<section class="space-y-3 rounded-2xl border border-border p-6">
				<h2 class="text-xl font-semibold">{t('deletePage.helpTitle')}</h2>
				<p>{t('deletePage.help')}</p>
				<div class="flex flex-wrap gap-4">
					<a
						href={localizedPath(props.locale, '/sign-in?recovery=1')}
						class="inline-flex min-h-11 items-center text-primary underline"
					>
						{t('deletePage.recover')}
					</a>
					<a href={mailto} class="inline-flex min-h-11 items-center text-primary underline">
						{t('deletePage.email', { email: SUPPORT_EMAIL })}
					</a>
				</div>
			</section>
		</main>
	)
}
