/** @jsxImportSource solid-js */

import { memberSettingsPreload } from '@/features/settings/solid/member-settings-preload'
import { MemberSettingsRoute } from '@/features/settings/solid/member-settings-route'
import { ProfileSettings } from '@/features/settings/solid/player-settings'

export const route = memberSettingsPreload('profile')

export default function SettingsPage() {
	return <MemberSettingsRoute section="profile" content={ProfileSettings} />
}
