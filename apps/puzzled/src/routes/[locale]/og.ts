import type { APIEvent } from '@solidjs/start/server'
import { serveSocialCard } from '@/server/social-card'

export function GET({ request, params }: APIEvent) {
	return serveSocialCard(request, params.locale)
}
