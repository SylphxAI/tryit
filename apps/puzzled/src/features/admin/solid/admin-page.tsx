/** @jsxImportSource solid-js */

import { Meta, Title } from '@solidjs/meta'
import { createAsync, query, redirect, revalidate, useLocation, useParams } from '@solidjs/router'
import { HttpHeader, HttpStatusCode } from '@solidjs/start'
import { Show } from 'solid-js'
import { getRequestEvent } from 'solid-js/web'
import { defaultLocale, isValidLocale } from '@/lib/i18n/config'
import { localizedPath } from '@/lib/seo/urls'
import { type AdminCommand, type AdminSection, adminOptions, adminPath } from './admin-routes'
import { AdminAccess, AdminView } from './admin-view'

const getAdminPage = query(
	async (section: AdminSection, localeParam: string, slug: string, search: string) => {
		'use server'
		const event = getRequestEvent()
		if (!event) throw new Error('The admin console needs a request')
		event.response.headers.set('Cache-Control', 'private, no-store')
		event.response.headers.set('X-Robots-Tag', 'noindex, nofollow')
		event.response.headers.set('Referrer-Policy', 'no-referrer')
		const { readAdminDocument } = await import('./admin-data')
		const data = await readAdminDocument(event.request, section, slug, new URLSearchParams(search))
		if (data.kind === 'guest') {
			const locale = isValidLocale(localeParam) ? localeParam : defaultLocale
			const callbackUrl = localizedPath(locale, adminPath(section, slug)) + search
			throw redirect(localizedPath(locale, `/sign-in?${new URLSearchParams({ callbackUrl })}`), {
				headers: {
					'Cache-Control': 'private, no-store',
					'X-Robots-Tag': 'noindex, nofollow',
					'Referrer-Policy': 'no-referrer',
				},
			})
		}
		return data
	},
	'admin-document',
)

async function command(input: AdminCommand) {
	'use server'
	const event = getRequestEvent()
	if (!event) return 'denied' as const
	event.response.headers.set('Cache-Control', 'private, no-store')
	const { executeAdminCommand } = await import('./admin-mutation')
	return executeAdminCommand(event.request, input)
}

export function AdminPage(props: { section: AdminSection; gameDetail?: boolean }) {
	const params = useParams()
	const location = useLocation()
	const locale = () => {
		const value = params.locale ?? defaultLocale
		return isValidLocale(value) ? value : defaultLocale
	}
	const slug = () => (props.gameDetail ? (params.slug ?? '') : '')
	const search = () => {
		const value = adminOptions(new URLSearchParams(location.search))
		const query = new URLSearchParams()
		if (props.section === 'games' && slug() && value.days !== 30)
			query.set('days', String(value.days))
		if ((props.section === 'auditLogs' || props.section === 'dlq') && value.page > 1)
			query.set('page', String(value.page))
		if (props.section === 'auditLogs' && value.action) query.set('action', value.action)
		return query.size ? `?${query.toString()}` : ''
	}
	const key = () => getAdminPage.keyFor(props.section, locale(), slug(), search())
	const data = createAsync(() => getAdminPage(props.section, locale(), slug(), search()), {
		deferStream: true,
	})
	return (
		<>
			<HttpHeader name="Cache-Control" value="private, no-store" />
			<HttpHeader name="Referrer-Policy" value="no-referrer" />
			<HttpHeader name="X-Robots-Tag" value="noindex, nofollow" />
			<Meta name="robots" content="noindex, nofollow" />
			<Title>Admin Console | Tryit</Title>
			<Show when={data()} keyed>
				{(page) => {
					if (page.kind === 'denied' || page.kind === 'missing')
						return (
							<>
								<HttpStatusCode code={page.kind === 'denied' ? 403 : 404} />
								<AdminAccess locale={locale()} missing={page.kind === 'missing'} />
							</>
						)
					return (
						<AdminView
							locale={locale()}
							section={props.section}
							data={page}
							refresh={() => void revalidate(key())}
							run={async (input) => {
								const result = await command(input)
								if (result === 'saved' || result === 'denied') void revalidate(getAdminPage.key)
								return result
							}}
						/>
					)
				}}
			</Show>
		</>
	)
}
