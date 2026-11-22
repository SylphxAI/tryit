export const adminSections = [
	'dashboard',
	'analytics',
	'announcements',
	'auditLogs',
	'dlq',
	'experiments',
	'games',
	'settings',
	'system',
] as const
export type AdminSection = (typeof adminSections)[number]
export const adminPageSize = 50
export const auditActions = [
	'create',
	'update',
	'delete',
	'login',
	'logout',
	'role_change',
	'subscription_change',
	'impersonate_start',
	'impersonate_end',
	'feature_flag_toggle',
	'admin_action',
	'admin_access',
] as const
const segments: Record<AdminSection, string> = {
	dashboard: '',
	analytics: '/analytics',
	announcements: '/announcements',
	auditLogs: '/audit-logs',
	dlq: '/dlq',
	experiments: '/experiments',
	games: '/games',
	settings: '/settings',
	system: '/system',
}
export function adminPath(section: AdminSection, slug?: string) {
	return (
		'/admin' +
		segments[section] +
		(section === 'games' && slug ? `/${encodeURIComponent(slug)}` : '')
	)
}
export function adminOptions(query: URLSearchParams) {
	const page = Number(query.get('page'))
	const days = Number(query.get('days'))
	const rawAction = query.get('action')
	return {
		page: Number.isInteger(page) && page > 0 && page <= 10000 ? page : 1,
		days: [7, 14, 30, 90].includes(days) ? days : 30,
		action: auditActions.find((value) => value === rawAction) ?? '',
	}
}

export const announcementTypes = ['info', 'warning', 'success', 'maintenance'] as const
export type AnnouncementType = (typeof announcementTypes)[number]
export type AdminCommand =
	| {
			kind: 'announcement-save'
			id: string
			title: string
			body: string
			type: AnnouncementType
			active: boolean
			dismissible: boolean
			startsAt: string
			endsAt: string
	  }
	| { kind: 'announcement-delete' | 'dlq-retry' | 'dlq-resolve' | 'dlq-fail'; id: string }
