/** @jsxImportSource solid-js */
import {
	MemberSettingsRoute,
	memberSettingsPreload,
} from '@/features/settings/solid/member-settings-route'
import { SettingsOverview } from '@/features/settings/solid/player-settings'

export const route = memberSettingsPreload('overview')

export default function SettingsPage() {
	return <MemberSettingsRoute section="overview" content={SettingsOverview} />
}
