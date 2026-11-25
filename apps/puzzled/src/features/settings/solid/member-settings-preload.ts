import { query, type RouteDefinition, redirect } from '@solidjs/router'
import { getRequestEvent } from 'solid-js/web'
import { defaultLocale, isValidLocale } from '@/lib/i18n/config'
import { localizedPath } from '@/lib/seo/urls'
import { type MemberSettingsSection, settingsPath } from './sections'

export const readMemberSettingsPage = query(
	async (localeParam: string, section: MemberSettingsSection) => {
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
	},
	'member-settings',
)

export function memberSettingsPreload(section: MemberSettingsSection): RouteDefinition {
	return {
		matchFilters: { locale: isValidLocale },
		preload: ({ params }) => readMemberSettingsPage(params.locale ?? defaultLocale, section),
	}
}
