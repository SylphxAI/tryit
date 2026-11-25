/** @jsxImportSource solid-js */

import { AccountSettings } from '@/features/settings/solid/account-settings'
import { memberSettingsPreload } from '@/features/settings/solid/member-settings-preload'
import { MemberSettingsRoute } from '@/features/settings/solid/member-settings-route'

export const route = memberSettingsPreload('account')

export default function SettingsPage() {
	return <MemberSettingsRoute section="account" content={AccountSettings} />
}
