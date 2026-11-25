/** @jsxImportSource solid-js */

import { memberSettingsPreload } from '@/features/settings/solid/member-settings-preload'
import { MemberSettingsRoute } from '@/features/settings/solid/member-settings-route'
import { PreferencesSettings } from '@/features/settings/solid/preferences-settings'

export const route = memberSettingsPreload('preferences')
export default function SettingsPage() {
	return <MemberSettingsRoute section="preferences" content={PreferencesSettings} />
}
