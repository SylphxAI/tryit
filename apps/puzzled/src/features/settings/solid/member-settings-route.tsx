/** @jsxImportSource solid-js */
import { createAsync, query, type RouteDefinition, redirect, useParams } from '@solidjs/router'
import { HttpHeader } from '@solidjs/start'
import { type Component, Show } from 'solid-js'
import { getRequestEvent } from 'solid-js/web'
import { defaultLocale, isValidLocale } from '@/lib/i18n/config'
import { createTranslator, type Translate } from '@/lib/i18n/translate'
import { localizedPath } from '@/lib/seo/urls'
import { PageMeta } from '@/shared/solid/page-meta'
import { SiteShell } from '@/shared/solid/site-shell'
import { type MemberSettingsSection, settingsPath } from './sections'
import type { MemberSettingsData } from './settings-data'
import { SettingsShell } from './settings-shell'

const readPage = query(async (localeParam: string, section: MemberSettingsSection) => {
	'use server'
	const request = getRequestEvent()?.request
	if (!request) throw new Error('Settings needs a request')
	const locale = isValidLocale(localeParam) ? localeParam : defaultLocale
	const { readMemberSettings } = await import('./settings-data')
	const page = await readMemberSettings(locale, section, request)
	if (!page) {
		const callback = new URLSearchParams({
			callbackUrl: localizedPath(locale, settingsPath(section)),
		})
		throw redirect(localizedPath(locale, `/sign-in?${callback}`), {
			headers: { 'Cache-Control': 'private, no-store' },
		})
	}
	return page
}, 'member-settings')

export function memberSettingsPreload(section: MemberSettingsSection): RouteDefinition {
	return {
		matchFilters: { locale: isValidLocale },
		preload: ({ params }) => readPage(params.locale ?? defaultLocale, section),
	}
}

export function MemberSettingsRoute(props: {
	section: MemberSettingsSection
	content: Component<{ data: MemberSettingsData; t: Translate }>
}) {
	const params = useParams()
	const page = createAsync(() => readPage(params.locale ?? defaultLocale, props.section), {
		deferStream: true,
	})
	return (
		<>
			<HttpHeader name="Cache-Control" value="private, no-store" />
			<Show when={page()} keyed>
				{(data) => (
					<>
						<PageMeta value={data.meta} />
						<SiteShell data={data.shell}>
							<SettingsShell locale={data.locale} section={props.section} member>
								<props.content data={data} t={createTranslator(data.locale)} />
							</SettingsShell>
						</SiteShell>
					</>
				)}
			</Show>
		</>
	)
}
