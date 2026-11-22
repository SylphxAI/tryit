/** @jsxImportSource solid-js */

import { AccountSettings } from '@/features/settings/solid/account-settings'
import {
	MemberSettingsRoute,
	memberSettingsPreload,
} from '@/features/settings/solid/member-settings-route'

export const route = memberSettingsPreload('account')

export default function SettingsPage() {
	return <MemberSettingsRoute section="account" content={AccountSettings} />
}
