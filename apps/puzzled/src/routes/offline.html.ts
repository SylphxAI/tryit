import type { APIEvent } from '@solidjs/start/server'
import { offlineResponse } from '@/server/offline-response'

export function GET({ request }: APIEvent) {
	return offlineResponse(request)
}
