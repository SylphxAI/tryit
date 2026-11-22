/** @jsxImportSource solid-js */
import type { RouteDefinition } from '@solidjs/router'
import { AdminPage } from '@/features/admin/solid/admin-page'
import { isValidLocale } from '@/lib/i18n/config'

export const route = { matchFilters: { locale: isValidLocale } } satisfies RouteDefinition

export default function Page() {
	return <AdminPage section="announcements" />
}
