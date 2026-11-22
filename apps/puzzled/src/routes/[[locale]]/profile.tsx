/** @jsxImportSource solid-js */
import { createAsync, query, type RouteDefinition, redirect, useParams } from '@solidjs/router'
import { HttpHeader } from '@solidjs/start'
import { Show } from 'solid-js'
import { getRequestEvent } from 'solid-js/web'
import { ProfileCard } from '@/features/console/solid/profile-card'
import { defaultLocale, isValidLocale } from '@/lib/i18n/config'
import { localizedPath } from '@/lib/seo/urls'
import { PageMeta } from '@/shared/solid/page-meta'
import { SiteShell } from '@/shared/solid/site-shell'

const readPage = query(async (localeParam: string) => {
	'use server'
	const request = getRequestEvent()?.request
	if (!request) throw new Error('Player profile needs a request')
	const { readProfile } = await import('@/features/console/solid/profile-data')
	const locale = isValidLocale(localeParam) ? localeParam : defaultLocale
	const page = await readProfile(locale, request)
	if (!page) {
		const callback = new URLSearchParams({ callbackUrl: localizedPath(locale, '/profile') })
		throw redirect(localizedPath(locale, `/sign-in?${callback}`), {
			headers: { 'Cache-Control': 'private, no-store' },
		})
	}
	return page
}, 'console-profile')

export const route: RouteDefinition = {
	matchFilters: { locale: isValidLocale },
	preload: ({ params }) => readPage(params.locale ?? defaultLocale),
}

export default function ProfilePage() {
	const params = useParams()
	const page = createAsync(() => readPage(params.locale ?? defaultLocale), { deferStream: true })
	return (
		<>
			<HttpHeader name="Cache-Control" value="private, no-store" />
			<Show when={page()} keyed>
				{(data) => (
					<>
						<PageMeta value={data.meta} />
						<SiteShell data={data.shell}>
							<ProfileCard data={data} />
						</SiteShell>
					</>
				)}
			</Show>
		</>
	)
}
