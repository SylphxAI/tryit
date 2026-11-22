/** @jsxImportSource solid-js */
import {
	MemberSettingsRoute,
	memberSettingsPreload,
} from '@/features/settings/solid/member-settings-route'
import { NotificationSettings } from '@/features/settings/solid/notification-settings'

export const route = memberSettingsPreload('notifications')
export default function SettingsPage() {
	return <MemberSettingsRoute section="notifications" content={NotificationSettings} />
}
