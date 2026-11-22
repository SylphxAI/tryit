export const settingsSections = [
	'overview',
	'profile',
	'account',
	'subscription',
	'preferences',
	'notifications',
	'security',
	'privacy',
] as const

export type SettingsSection = (typeof settingsSections)[number]
export type MemberSettingsSection = Exclude<SettingsSection, 'subscription'>

export function settingsPath(section: SettingsSection) {
	return section === 'overview' ? '/settings' : `/settings/${section}`
}
