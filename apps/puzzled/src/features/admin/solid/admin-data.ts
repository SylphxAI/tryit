import 'server-only'
import { create } from '@bufbuild/protobuf'
import { Code, ConnectError, createClient } from '@connectrpc/connect'
import { getGameConfig } from '@/games/registry'
import { AdminService, GetMetricsReportRequestSchema } from '@/gen/connect/puzzled/v1/admin_pb'
import { requestConnectTransport } from '@/lib/api/request-connect'
import {
	gameAnalytics,
	gamesOverview,
	getSettings,
	listAnnouncements,
	listAuditLogs,
	listDlq,
	systemHealth,
} from '@/lib/connect/admin-client'
import { requestUser } from '@/lib/identity/request-identity'
import { logger } from '@/lib/logger'
import { withPresentationDeadline } from '@/lib/presentation-document'
import { type AdminSection, adminOptions, adminPageSize } from './admin-routes'

export async function readAdminDocument(
	request: Request,
	section: AdminSection,
	slug: string,
	params: URLSearchParams,
) {
	if (!(await withPresentationDeadline(requestUser(request), null)))
		return { kind: 'guest' as const }
	let client: ReturnType<typeof createClient<typeof AdminService>>
	try {
		client = createClient(AdminService, requestConnectTransport(request.headers))
		// Same verified scope as the API's own authorization on every admin RPC.
		// Do not return the settings probe's payload to the document.
		await getSettings(client)
	} catch (error) {
		const code = ConnectError.from(error).code
		if (code !== Code.PermissionDenied && code !== Code.Unauthenticated) {
			logger.warn('admin.gate-check-failed')
		}
		return { kind: 'denied' as const }
	}
	if (slug && (section !== 'games' || !getGameConfig(slug))) return { kind: 'missing' as const }
	const options = adminOptions(params)
	const paging = { limit: adminPageSize, offset: (options.page - 1) * adminPageSize }
	const metrics = () => client.getMetricsReport(create(GetMetricsReportRequestSchema))
	try {
		switch (section) {
			case 'dashboard': {
				const [games, queue, activity, health] = await Promise.allSettled([
					gamesOverview(client),
					listDlq({ limit: 1 }, client),
					listAuditLogs({ limit: 8 }, client),
					systemHealth(client),
				])
				return {
					kind: section,
					sessions:
						games.status === 'fulfilled'
							? games.value.reduce((total, row) => total + row.allTimePlayed, 0)
							: null,
					pending: queue.status === 'fulfilled' ? queue.value.pending : null,
					failed: queue.status === 'fulfilled' ? queue.value.failed : null,
					activity: activity.status === 'fulfilled' ? activity.value.entries : null,
					databaseOk: health.status === 'fulfilled' ? health.value.databaseOk : null,
				}
			}
			case 'analytics':
				return { kind: section, report: await metrics() }
			case 'announcements':
				return { kind: section, rows: await listAnnouncements(client) }
			case 'auditLogs':
				return {
					kind: section,
					...(await listAuditLogs({ ...paging, action: options.action }, client)),
					options,
				}
			case 'dlq':
				return { kind: section, ...(await listDlq(paging, client)), options }
			case 'games':
				return slug
					? {
							kind: 'game' as const,
							slug,
							days: options.days,
							rows: await gameAnalytics(slug, options.days, client),
						}
					: { kind: section, rows: await gamesOverview(client) }
			case 'system':
				return { kind: section, health: await systemHealth(client) }
			case 'experiments':
			case 'settings':
				return { kind: section }
		}
	} catch (error) {
		const code = ConnectError.from(error).code
		if (code === Code.PermissionDenied || code === Code.Unauthenticated)
			return { kind: 'denied' as const }
		logger.warn('admin.document-unavailable', { section, code })
		return { kind: 'unavailable' as const }
	}
}

export type AdminDocumentData = Awaited<ReturnType<typeof readAdminDocument>>
