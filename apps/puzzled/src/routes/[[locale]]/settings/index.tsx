/** @jsxImportSource solid-js */

import { memberSettingsPreload } from '@/features/settings/solid/member-settings-preload'
import { MemberSettingsRoute } from '@/features/settings/solid/member-settings-route'
import { SettingsOverview } from '@/features/settings/solid/player-settings'

export const route = memberSettingsPreload('overview')

export default function SettingsPage() {
	return <MemberSettingsRoute section="overview" content={SettingsOverview} />
}
