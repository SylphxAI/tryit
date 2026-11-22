import type { APIEvent } from '@solidjs/start/server'
import { renderSocialCard } from '@/server/social-card'

export function GET({ request }: APIEvent) {
	return renderSocialCard(request)
}
