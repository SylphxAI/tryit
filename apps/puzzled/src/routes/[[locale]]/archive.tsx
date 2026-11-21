/** @jsxImportSource solid-js */
import { createAsync, query, type RouteDefinition, useParams } from '@solidjs/router'
import { HttpHeader } from '@solidjs/start'
import { Show } from 'solid-js'
import { getRequestEvent } from 'solid-js/web'
import { ArchivePage } from '@/features/daily/solid/archive-page'
import { defaultLocale, isValidLocale, locales } from '@/lib/i18n/config'

const getArchive = query(async (locale: string) => {
	'use server'
	const request = getRequestEvent()?.request
	if (!request) throw new Error('Archive requires a request')
	const { readArchivePage } = await import('@/features/daily/solid/archive-data')
	return readArchivePage(isValidLocale(locale) ? locale : defaultLocale, request)
}, 'archive-page')

export const route = {
	matchFilters: { locale: (segment: string) => locales.some((locale) => locale === segment) },
	preload: ({ params }) => getArchive(params.locale ?? defaultLocale),
} satisfies RouteDefinition

export default function Archive() {
	const params = useParams()
	const data = createAsync(() => getArchive(params.locale ?? defaultLocale), { deferStream: true })
	return (
		<>
			<HttpHeader name="Cache-Control" value="private, no-store" />
			<Show when={data()} keyed>
				{(page) => <ArchivePage data={page} />}
			</Show>
		</>
	)
}
