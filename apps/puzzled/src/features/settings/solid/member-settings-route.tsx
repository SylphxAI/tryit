/** @jsxImportSource solid-js */
import { createAsync, useParams } from '@solidjs/router'
import { HttpHeader } from '@solidjs/start'
import { type Component, Show } from 'solid-js'
import { defaultLocale } from '@/lib/i18n/config'
import { createTranslator, type Translate } from '@/lib/i18n/translate'
import { PageMeta } from '@/shared/solid/page-meta'
import { SiteShell } from '@/shared/solid/site-shell'
import { readMemberSettingsPage } from './member-settings-preload'
import type { MemberSettingsSection } from './sections'
import type { MemberSettingsData } from './settings-data'
import { SettingsShell } from './settings-shell'

export function MemberSettingsRoute(props: {
	section: MemberSettingsSection
	content: Component<{ data: MemberSettingsData; t: Translate }>
}) {
	const params = useParams()
	const page = createAsync(
		() => readMemberSettingsPage(params.locale ?? defaultLocale, props.section),
		{
			deferStream: true,
		},
	)
	return (
		<>
			<HttpHeader name="Cache-Control" value="private, no-store" />
			<Show when={page()} keyed>
				{(data) => (
					<>
						<PageMeta value={data.meta} />
						<SiteShell data={data.shell} signedIn>
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
