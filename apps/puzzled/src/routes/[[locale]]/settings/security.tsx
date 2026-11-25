/** @jsxImportSource solid-js */

import { memberSettingsPreload } from '@/features/settings/solid/member-settings-preload'
import { MemberSettingsRoute } from '@/features/settings/solid/member-settings-route'
import { SecuritySettings } from '@/features/settings/solid/security-settings'

export const route = memberSettingsPreload('security')

export default function SettingsPage() {
	return (
		<MemberSettingsRoute
			section="security"
			content={({ data, t }) => <SecuritySettings locale={data.locale} t={t} />}
		/>
	)
}
