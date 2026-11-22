/** @jsxImportSource solid-js */
import {
	createAsync,
	query,
	type RouteDefinition,
	redirect,
	useLocation,
	useParams,
} from '@solidjs/router'
import { HttpHeader } from '@solidjs/start'
import { Check } from 'lucide-solid'
import { Show } from 'solid-js'
import { getRequestEvent } from 'solid-js/web'
import { SettingsShell } from '@/features/settings/solid/settings-shell'
import { SubscriptionPanel } from '@/features/settings/solid/subscription-panel'
import { defaultLocale, isValidLocale } from '@/lib/i18n/config'
import { createTranslator } from '@/lib/i18n/translate'
import { localizedPath } from '@/lib/seo/urls'
import { PageMeta } from '@/shared/solid/page-meta'
import { SiteShell } from '@/shared/solid/site-shell'

function signIn(locale: string, returnTo: string) {
	const callbackUrl = localizedPath(locale, returnTo)
	return localizedPath(locale, `/sign-in?${new URLSearchParams({ callbackUrl })}`)
}

const getSubscription = query(async (localeParam: string, search: string) => {
	'use server'
	const event = getRequestEvent()
	if (!event) throw new Error('Subscription needs a request')
	event.response.headers.set('Cache-Control', 'private, no-store')
	event.response.headers.set('Referrer-Policy', 'no-referrer')
	const { readSubscriptionPage } = await import('@/features/settings/solid/subscription-data')
	const locale = isValidLocale(localeParam) ? localeParam : defaultLocale
	const data = await readSubscriptionPage(locale, event.request, new URLSearchParams(search), true)
	if (data.kind === 'guest')
		throw redirect(signIn(locale, data.handoff.returnTo), {
			headers: { 'Cache-Control': 'private, no-store', 'Referrer-Policy': 'no-referrer' },
		})
	return data
}, 'subscription-settings')

async function refreshSubscription(localeParam: string, search: string) {
	'use server'
	const event = getRequestEvent()
	if (!event) throw new Error('Subscription refresh needs a request')
	event.response.headers.set('Cache-Control', 'private, no-store')
	event.response.headers.set('Referrer-Policy', 'no-referrer')
	const { readSubscriptionPage } = await import('@/features/settings/solid/subscription-data')
	const locale = isValidLocale(localeParam) ? localeParam : defaultLocale
	const data = await readSubscriptionPage(locale, event.request, new URLSearchParams(search), false)
	return data.kind === 'member'
		? { kind: data.kind, view: data.view, conversion: data.conversion }
		: {
				kind: 'signed-out' as const,
				href:
					data.kind === 'claim'
						? localizedPath(locale, data.handoff.returnTo)
						: signIn(locale, data.handoff.returnTo),
			}
}

// Unlike ordinary settings, this document can reconcile a pending claim.
// Do not execute it as a speculative hover preload.
export const route = { matchFilters: { locale: isValidLocale } } satisfies RouteDefinition

export default function Subscription() {
	const params = useParams()
	const location = useLocation()
	const data = createAsync(() => getSubscription(params.locale ?? defaultLocale, location.search), {
		deferStream: true,
	})
	return (
		<>
			<HttpHeader name="Cache-Control" value="private, no-store" />
			<HttpHeader name="Referrer-Policy" value="no-referrer" />
			<Show when={data()} keyed>
				{(page) => {
					const search = new URL(page.handoff.returnTo, 'https://local.invalid').search
					const t = createTranslator(page.locale)
					return (
						<>
							<PageMeta value={page.meta} />
							<SiteShell data={page.shell}>
								<SettingsShell
									locale={page.locale}
									section="subscription"
									member={page.kind === 'member'}
								>
									{page.kind === 'member' ? (
										<SubscriptionPanel
											data={page}
											t={t}
											refresh={() => refreshSubscription(page.locale, search)}
										/>
									) : (
										<section class="surface-card mx-auto flex max-w-lg flex-col items-center p-6 text-center sm:p-8">
											<span class="flex h-14 w-14 items-center justify-center rounded-full bg-success/15 text-success">
												<Check class="h-7 w-7" aria-hidden="true" />
											</span>
											<h1 class="mt-4 font-display text-2xl text-balance">
												{t('plus.subscription.claimTitle')}
											</h1>
											<p class="mt-2 text-sm leading-relaxed text-muted-foreground">
												{t('plus.subscription.claimBody')}
											</p>
											<a
												href={signIn(page.locale, page.handoff.returnTo)}
												class="pressable mt-6 inline-flex min-h-12 w-full items-center justify-center rounded-full bg-primary px-5 font-semibold text-primary-foreground hover:bg-primary-hover"
											>
												{t('plus.subscription.claimSignIn')}
											</a>
										</section>
									)}
								</SettingsShell>
							</SiteShell>
						</>
					)
				}}
			</Show>
		</>
	)
}
