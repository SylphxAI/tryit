import 'server-only'
import { create } from '@bufbuild/protobuf'
import { Code, ConnectError, createClient } from '@connectrpc/connect'
import {
	AdminService,
	DeleteAnnouncementRequestSchema,
	MarkDlqFailedRequestSchema,
	ResolveDlqRequestSchema,
	RetryDlqRequestSchema,
} from '@/gen/connect/puzzled/v1/admin_pb'
import { requestConnectTransport } from '@/lib/api/request-connect'
import { createAnnouncement, updateAnnouncement } from '@/lib/connect/admin-client'
import { admitSameOrigin } from '@/lib/identity/http'
import { requestUser } from '@/lib/identity/request-identity'
import { logger } from '@/lib/logger'
import { withPresentationDeadline } from '@/lib/presentation-document'
import { type AdminCommand, announcementTypes } from './admin-routes'

const uuid = /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i
const isInstant = (value: unknown): value is string =>
	typeof value === 'string' &&
	(value === '' ||
		(/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/.test(value) && Number.isFinite(Date.parse(value))))

export type AdminMutationResult = 'saved' | 'invalid' | 'denied' | 'unconfirmed'

export async function executeAdminCommand(
	request: Request,
	input: AdminCommand,
): Promise<AdminMutationResult> {
	if (
		request.method !== 'POST' ||
		!request.headers.get('origin') ||
		(await admitSameOrigin(request))
	)
		return 'denied'
	if (!(await withPresentationDeadline(requestUser(request), null))) return 'denied'
	if (!input || typeof input !== 'object') return 'invalid'
	try {
		const client = createClient(AdminService, requestConnectTransport(request.headers))
		switch (input.kind) {
			case 'announcement-save': {
				const { id, title, body, type, active, dismissible, startsAt, endsAt } = input
				if (
					typeof id !== 'string' ||
					(id !== '' && !uuid.test(id)) ||
					typeof title !== 'string' ||
					!title.trim() ||
					title.length > 255 ||
					typeof body !== 'string' ||
					!body.trim() ||
					body.length > 10000 ||
					!announcementTypes.includes(type) ||
					typeof active !== 'boolean' ||
					typeof dismissible !== 'boolean' ||
					!isInstant(startsAt) ||
					!isInstant(endsAt) ||
					(startsAt && endsAt && startsAt >= endsAt)
				)
					return 'invalid'
				const fields = {
					title: title.trim(),
					body: body.trim(),
					type,
					active,
					dismissible,
					startsAt,
					endsAt,
				}
				if (id) await updateAnnouncement({ ...fields, id }, client)
				else await createAnnouncement(fields, client)
				return 'saved'
			}
			case 'announcement-delete':
			case 'dlq-retry':
			case 'dlq-resolve':
			case 'dlq-fail': {
				if (typeof input.id !== 'string' || !uuid.test(input.id)) return 'invalid'
				const { id } = input
				const ok =
					input.kind === 'announcement-delete'
						? (await client.deleteAnnouncement(create(DeleteAnnouncementRequestSchema, { id })))
								.deleted
						: input.kind === 'dlq-retry'
							? (await client.retryDlq(create(RetryDlqRequestSchema, { id }))).ok
							: input.kind === 'dlq-resolve'
								? (await client.resolveDlq(create(ResolveDlqRequestSchema, { id }))).ok
								: (await client.markDlqFailed(create(MarkDlqFailedRequestSchema, { id }))).ok
				return ok ? 'saved' : 'unconfirmed'
			}
			default:
				return 'invalid'
		}
	} catch (error) {
		const code = ConnectError.from(error).code
		if (code === Code.PermissionDenied || code === Code.Unauthenticated) return 'denied'
		if (code === Code.InvalidArgument || code === Code.FailedPrecondition) return 'invalid'
		logger.warn('admin.command-unconfirmed', { code })
		return 'unconfirmed'
	}
}
