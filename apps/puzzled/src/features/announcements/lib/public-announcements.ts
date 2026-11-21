import { create } from '@bufbuild/protobuf'
import { createClient } from '@connectrpc/connect'
import {
	AnnouncementService,
	ListActiveAnnouncementsRequestSchema,
} from '@/gen/connect/puzzled/v1/announcements_pb'
import { requestConnectTransport } from '@/lib/api/request-connect'
import { createActiveAnnouncementsCache } from './active-cache'

/**
 * The notices an admin has switched on right now, shared across requests (see
 * `active-cache`). The endpoint ignores identity, so this uses a bare
 * transport: no session or guest cookie and no user agent leave the web tier.
 */
const activeAnnouncements = createActiveAnnouncementsCache({
	fetch: async () => {
		const transport = requestConnectTransport()
		const res = await createClient(AnnouncementService, transport).listActiveAnnouncements(
			create(ListActiveAnnouncementsRequestSchema, {}),
		)
		return res.announcements.map((a) => ({
			id: a.id,
			title: a.title,
			body: a.body,
			type: a.type,
			dismissible: a.dismissible,
			endsAt: a.endsAt,
		}))
	},
})

export const getServerActiveAnnouncements = () => activeAnnouncements.get()
