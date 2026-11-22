/** @jsxImportSource solid-js */
import {
	MemberSettingsRoute,
	memberSettingsPreload,
} from '@/features/settings/solid/member-settings-route'
import { PrivacySettings } from '@/features/settings/solid/player-settings'

export const route = memberSettingsPreload('privacy')

export default function SettingsPage() {
	return <MemberSettingsRoute section="privacy" content={PrivacySettings} />
}
